import os
import re
import uuid
import tempfile
import shutil
from flask import Flask, render_template, request, jsonify, send_file
import yt_dlp
import requests
from bs4 import BeautifulSoup

app = Flask(__name__)

# Pasta temporária para downloads
DOWNLOAD_DIR = os.path.join(tempfile.gettempdir(), 'tiktok_downloads')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Regex para validar URLs do TikTok
TIKTOK_URL_PATTERNS = [
    r'https?://(www\.)?tiktok\.com/@[\w.-]+/video/\d+',
    r'https?://(www\.)?tiktok\.com/t/\w+',
    r'https?://vm\.tiktok\.com/\w+',
    r'https?://m\.tiktok\.com/v/\d+',
    r'https?://(www\.)?tiktok\.com/@[\w.-]+/photo/\d+',
    r'https?://vt\.tiktok\.com/\w+',
]


def is_valid_tiktok_url(url):
    """Valida se a URL é do TikTok."""
    for pattern in TIKTOK_URL_PATTERNS:
        if re.match(pattern, url.strip()):
            return True
    return False


def clean_old_files():
    """Remove arquivos com mais de 10 minutos."""
    import time
    now = time.time()
    for filename in os.listdir(DOWNLOAD_DIR):
        filepath = os.path.join(DOWNLOAD_DIR, filename)
        if os.path.isfile(filepath):
            if now - os.path.getmtime(filepath) > 600:  # 10 minutos
                try:
                    os.remove(filepath)
                except OSError:
                    pass


@app.route('/')
def index():
    """Página principal."""
    return render_template('index.html')


def scrape_ssstik_links(url):
    """Realiza o scraping do SSSTik.io para obter os links de download reais (inclusive HD/4K)."""
    try:
        session = requests.Session()
        h = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        session.headers.update(h)
        
        # 1. Obter o token s_tt inicial
        r_home = session.get('https://ssstik.io/pt')
        tt_match = re.search(r"s_tt\s*=\s*'([^']+)'", r_home.text)
        if not tt_match:
            return None
        tt_init = tt_match.group(1)
        
        # 2. Enviar a URL para processamento
        post_headers = {
            'hx-current-url': 'https://ssstik.io/pt',
            'hx-request': 'true',
            'hx-target': 'target',
            'hx-trigger': '_gcaptcha_pt',
            'origin': 'https://ssstik.io',
            'referer': 'https://ssstik.io/pt'
        }
        
        r_post = session.post('https://ssstik.io/abc?url=dl', data={
            'id': url,
            'locale': 'pt',
            'tt': tt_init
        }, headers=post_headers)
        
        if r_post.status_code != 200:
            return None
            
        soup = BeautifulSoup(r_post.text, 'html.parser')
        
        links = {
            'normal_video': None,
            'hd_video': None,
            'audio': None
        }
        
        # Encontrar link de áudio (MP3)
        music_btn = soup.find('a', class_='music')
        if music_btn and music_btn.get('href'):
            links['audio'] = music_btn.get('href')
            
        # Encontrar link normal de vídeo
        normal_btn = soup.find('a', class_='without_watermark')
        if normal_btn and normal_btn.get('href'):
            links['normal_video'] = normal_btn.get('href')
            
        # Encontrar link HD de vídeo
        hd_btn = soup.find('a', {'id': 'hd_download'})
        if hd_btn and hd_btn.get('data-directurl'):
            direct_url = hd_btn.get('data-directurl')
            tt_input = soup.find('input', {'name': 'tt'})
            tt_post = tt_input.get('value') if tt_input else tt_init
            
            # Fazer a requisição para liberar o link HD
            r_hd = session.post('https://ssstik.io' + direct_url, data={
                'tt': tt_post
            }, headers={
                'hx-request': 'true',
                'hx-target': 'target',
                'origin': 'https://ssstik.io',
                'referer': 'https://ssstik.io/pt'
            })
            
            hd_redirect = r_hd.headers.get('Hx-Redirect')
            if hd_redirect:
                links['hd_video'] = hd_redirect
                
        return links
    except Exception as e:
        print(f"Erro no scraper do SSSTik: {e}")
        return None


@app.route('/api/extract', methods=['POST'])
def extract_info():
    """Extrai informações do vídeo TikTok e os links direto do SSSTik."""
    data = request.get_json()
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'Por favor, insira um link do TikTok.'}), 400

    if not is_valid_tiktok_url(url):
        return jsonify({'error': 'Link inválido. Cole um link do TikTok válido.'}), 400

    try:
        # 1. Extrair metadados básicos com yt-dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        # Obter melhor resolução pelo yt-dlp
        width = info.get('width', 0)
        height = info.get('height', 0)
        formats = info.get('formats', [])
        best_height = height
        best_width = width
        for fmt in formats:
            fmt_height = fmt.get('height') or 0
            if fmt_height > best_height:
                best_height = fmt_height
                best_width = fmt.get('width') or 0

        # 2. Consultar SSSTik em background para ver se há HD/4K
        ssstik_links = scrape_ssstik_links(url)

        # Determinar label da qualidade
        if ssstik_links and ssstik_links.get('hd_video'):
            quality_label = 'Ultra HD 4K/1080p'
        elif best_height >= 2160:
            quality_label = '4K Ultra HD'
        elif best_height >= 1080:
            quality_label = 'Full HD 1080p'
        elif best_height >= 720:
            quality_label = 'HD 720p'
        else:
            quality_label = f'{best_height}p' if best_height > 0 else 'HD'

        # Extrair informações relevantes
        video_info = {
            'title': info.get('title', 'Sem título'),
            'author': info.get('uploader', info.get('creator', 'Desconhecido')),
            'thumbnail': info.get('thumbnail', ''),
            'duration': info.get('duration', 0),
            'url': url,
            'video_id': info.get('id', ''),
            'view_count': info.get('view_count', 0),
            'like_count': info.get('like_count', 0),
            'width': best_width,
            'height': best_height,
            'quality_label': quality_label,
            'filesize_approx': info.get('filesize_approx', 0),
        }

        return jsonify(video_info)

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        if 'Private' in error_msg or 'private' in error_msg:
            return jsonify({'error': 'Este vídeo é privado e não pode ser baixado.'}), 403
        elif 'not a bot' in error_msg.lower() or 'sign in' in error_msg.lower():
            return jsonify({'error': 'TikTok bloqueou temporariamente. Tente novamente em alguns minutos.'}), 429
        else:
            return jsonify({'error': 'Não foi possível processar este vídeo. Verifique o link e tente novamente.'}), 400
    except Exception as e:
        return jsonify({'error': 'Erro interno do servidor. Tente novamente.'}), 500


# Dicionário global para guardar o progresso dos downloads
DOWNLOAD_PROGRESS = {}


def run_server_download(download_id, url, format_type):
    """Executa o download em background e atualiza o progresso no dicionário global."""
    try:
        DOWNLOAD_PROGRESS[download_id]['status'] = 'fetching_links'
        ssstik_links = scrape_ssstik_links(url)
        
        direct_url = None
        ext = 'mp3' if format_type == 'mp3' else 'mp4'
        mimetype = 'audio/mpeg' if format_type == 'mp3' else 'video/mp4'
        
        if format_type == 'mp3':
            if ssstik_links:
                direct_url = ssstik_links.get('audio')
        elif format_type == 'mp4_hd':
            if ssstik_links:
                direct_url = ssstik_links.get('normal_video')
        else:  # mp4_4k
            if ssstik_links:
                direct_url = ssstik_links.get('hd_video') or ssstik_links.get('normal_video')
                
        # Se conseguimos o link direto, baixar por requests
        if direct_url:
            DOWNLOAD_PROGRESS[download_id]['status'] = 'downloading'
            output_filename = f"{download_id}.{ext}"
            output_filepath = os.path.join(DOWNLOAD_DIR, output_filename)
            
            h = {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            r = requests.get(direct_url, headers=h, stream=True)
            if r.status_code == 200:
                total_length = r.headers.get('content-length')
                if total_length is None:
                    with open(output_filepath, 'wb') as f:
                        f.write(r.content)
                else:
                    total_length = int(total_length)
                    dl = 0
                    with open(output_filepath, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            if chunk:
                                dl += len(chunk)
                                f.write(chunk)
                                percent = int((dl / total_length) * 100)
                                DOWNLOAD_PROGRESS[download_id]['percent'] = min(percent, 99)
            else:
                raise Exception(f"Erro HTTP {r.status_code} ao buscar link direto")
                
            # Obter título amigável
            title = "tiktok_video"
            try:
                with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True}) as ydl:
                    info = ydl.extract_info(url, download=False)
                    title = info.get('title', 'tiktok_video')
            except Exception:
                pass
                
            safe_title = re.sub(r'[^\w\s-]', '', title)[:50].strip()
            download_name = f'{safe_title}.{ext}' if safe_title else f'tiktok_media.{ext}'
            
            DOWNLOAD_PROGRESS[download_id].update({
                'percent': 100,
                'status': 'done',
                'file_path': output_filepath,
                'download_name': download_name,
                'mimetype': mimetype
            })
        else:
            # Fallback para yt-dlp
            DOWNLOAD_PROGRESS[download_id]['status'] = 'downloading'
            
            def ydl_hook(d):
                if d['status'] == 'downloading':
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                    downloaded = d.get('downloaded_bytes', 0)
                    if total > 0:
                        percent = int((downloaded / total) * 100)
                        DOWNLOAD_PROGRESS[download_id]['percent'] = min(percent, 99)
            
            if format_type == 'mp3':
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'format': 'bestaudio/best',
                    'outtmpl': os.path.join(DOWNLOAD_DIR, f'{download_id}.%(ext)s'),
                    'progress_hooks': [ydl_hook],
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '320',
                    }],
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    title = info.get('title', 'tiktok_audio')
                    
                mp3_file = None
                for f in os.listdir(DOWNLOAD_DIR):
                    if f.startswith(download_id) and f.endswith('.mp3'):
                        mp3_file = os.path.join(DOWNLOAD_DIR, f)
                        break
                        
                if not mp3_file or not os.path.exists(mp3_file):
                    raise Exception("Erro ao converter áudio via yt-dlp")
                    
                safe_title = re.sub(r'[^\w\s-]', '', title)[:50].strip()
                download_name = f'{safe_title}.mp3' if safe_title else 'tiktok_audio.mp3'
                
                DOWNLOAD_PROGRESS[download_id].update({
                    'percent': 100,
                    'status': 'done',
                    'file_path': mp3_file,
                    'download_name': download_name,
                    'mimetype': mimetype
                })
            else:
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
                    'format_sort': [
                        'res:2160' if format_type == 'mp4_4k' else 'res:1080',
                        'vcodec:h265',
                        'acodec:aac',
                    ],
                    'merge_output_format': 'mp4',
                    'outtmpl': os.path.join(DOWNLOAD_DIR, f'{download_id}.%(ext)s'),
                    'progress_hooks': [ydl_hook],
                    'postprocessors': [{
                        'key': 'FFmpegVideoRemuxer',
                        'preferedformat': 'mp4',
                    }],
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    title = info.get('title', 'tiktok_video')
                    
                video_file = None
                for f in os.listdir(DOWNLOAD_DIR):
                    if f.startswith(download_id) and not f.endswith('.part'):
                        video_file = os.path.join(DOWNLOAD_DIR, f)
                        break
                        
                if not video_file or not os.path.exists(video_file):
                    raise Exception("Erro ao baixar vídeo via yt-dlp")
                    
                safe_title = re.sub(r'[^\w\s-]', '', title)[:50].strip()
                download_name = f'{safe_title}.mp4' if safe_title else 'tiktok_video.mp4'
                
                DOWNLOAD_PROGRESS[download_id].update({
                    'percent': 100,
                    'status': 'done',
                    'file_path': video_file,
                    'download_name': download_name,
                    'mimetype': mimetype
                })
                
    except Exception as e:
        print(f"Erro no download assíncrono: {e}")
        DOWNLOAD_PROGRESS[download_id].update({
            'status': 'error',
            'error_msg': str(e)
        })


@app.route('/api/download/start', methods=['POST'])
def start_download():
    """Inicia o download em segundo plano e retorna o ID do download para acompanhamento."""
    data = request.get_json()
    url = data.get('url', '').strip()
    format_type = data.get('format', 'mp4_4k')

    if not url or not is_valid_tiktok_url(url):
        return jsonify({'error': 'Link inválido.'}), 400

    clean_old_files()

    download_id = str(uuid.uuid4())[:8]
    DOWNLOAD_PROGRESS[download_id] = {
        'percent': 0,
        'status': 'starting',
        'file_path': None,
        'download_name': 'tiktok_media.mp4',
        'mimetype': 'video/mp4'
    }

    import threading
    thread = threading.Thread(target=run_server_download, args=(download_id, url, format_type))
    thread.daemon = True
    thread.start()

    return jsonify({'download_id': download_id})


@app.route('/api/download/progress/<download_id>')
def get_progress(download_id):
    """Retorna o progresso atualizado de um download específico."""
    progress = DOWNLOAD_PROGRESS.get(download_id)
    if not progress:
        return jsonify({'error': 'Download não encontrado.'}), 404
    return jsonify(progress)


@app.route('/api/download/file/<download_id>')
def get_downloaded_file(download_id):
    """Envia o arquivo baixado final para o navegador do usuário."""
    progress = DOWNLOAD_PROGRESS.get(download_id)
    if not progress or not progress['file_path'] or not os.path.exists(progress['file_path']):
        return "Arquivo não encontrado ou download incompleto.", 404
        
    return send_file(
        progress['file_path'],
        as_attachment=True,
        download_name=progress['download_name'],
        mimetype=progress['mimetype']
    )


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
