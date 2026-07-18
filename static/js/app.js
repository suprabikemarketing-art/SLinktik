/**
 * Slink Tik - Frontend Logic
 * Handles video download popup modals, floating progress toasts, link fetching, and particle effects.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const urlInput = document.getElementById('urlInput');
    const pasteBtn = document.getElementById('pasteBtn');
    const clearBtn = document.getElementById('clearBtn');
    const btnActionVideo = document.getElementById('btnActionVideo');
    const btnActionAudio = document.getElementById('btnActionAudio');
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');

    // Modal elements
    const videoDownloadModal = document.getElementById('videoDownloadModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalMainContent = document.getElementById('modalMainContent');
    const modalProgressContainer = document.getElementById('modalProgressContainer');
    const modalProgressBar = document.getElementById('modalProgressBar');
    const modalProgressStatus = document.getElementById('modalProgressStatus');
    const modalProgressPercent = document.getElementById('modalProgressPercent');
    const modalBtnFullHd = document.getElementById('modalBtnFullHd');
    const modalBtn4k = document.getElementById('modalBtn4k');

    // Toast elements (Audio)
    const audioProgressToast = document.getElementById('audioProgressToast');
    const audioProgressBar = document.getElementById('audioProgressBar');
    const audioProgressStatus = document.getElementById('audioProgressStatus');
    const audioProgressPercent = document.getElementById('audioProgressPercent');

    // Preview elements
    const videoPreviewContainer = document.getElementById('videoPreviewContainer');
    const previewLoader = document.getElementById('previewLoader');
    const previewPlaceholder = document.getElementById('previewPlaceholder');
    const previewThumbnail = document.getElementById('previewThumbnail');
    const previewInfoOverlay = document.getElementById('previewInfoOverlay');
    const previewAuthor = document.getElementById('previewAuthor');
    const previewTitle = document.getElementById('previewTitle');

    let currentVideoUrl = '';
    let extractTimeout = null;
    let lastValidatedUrl = '';
    let loadedVideoData = null;

    // --- Particles Background ---
    function createParticles() {
        const container = document.getElementById('bgParticles');
        if (!container) return;

        const colors = [
            'rgba(168, 85, 247, 0.25)',
            'rgba(236, 72, 153, 0.15)',
            'rgba(124, 58, 237, 0.2)',
            'rgba(244, 114, 182, 0.15)',
        ];

        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            const size = Math.random() * 4 + 2;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.animationDuration = `${Math.random() * 15 + 10}s`;
            particle.style.animationDelay = `${Math.random() * 10}s`;
            container.appendChild(particle);
        }
    }

    createParticles();

    // --- Helper Functions for Preview Control ---
    function showPreviewLoading() {
        videoPreviewContainer.style.display = 'flex';
        // Allow display property to apply, then add class for transitions
        requestAnimationFrame(() => {
            videoPreviewContainer.classList.add('active');
        });
        previewLoader.style.display = 'flex';
        previewPlaceholder.style.display = 'block';
        previewThumbnail.style.display = 'none';
        previewInfoOverlay.style.display = 'none';
        hideError();
    }

    function hidePreview() {
        videoPreviewContainer.classList.remove('active');
        setTimeout(() => {
            if (!videoPreviewContainer.classList.contains('active')) {
                videoPreviewContainer.style.display = 'none';
            }
        }, 400);
        loadedVideoData = null;
    }

    async function triggerPreviewExtraction(url) {
        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();

            // Ignore response if the input has changed in the meantime
            if (urlInput.value.trim() !== url) {
                return;
            }

            if (!response.ok) {
                showError(data.error || 'Erro ao carregar a prévia do vídeo.');
                hidePreview();
                return;
            }

            loadedVideoData = data;
            currentVideoUrl = data.url;

            // Transition to Loaded state
            previewLoader.style.display = 'none';
            previewPlaceholder.style.display = 'none';
            
            previewThumbnail.src = data.thumbnail;
            previewThumbnail.style.display = 'block';
            
            previewAuthor.textContent = `@${data.author}`;
            previewTitle.textContent = data.title;
            previewInfoOverlay.style.display = 'flex';
            
        } catch (err) {
            if (urlInput.value.trim() === url) {
                showError('Erro de conexão ao carregar a prévia.');
                hidePreview();
            }
        }
    }

    // --- Input State Management ---
    urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        
        if (url) {
            pasteBtn.style.display = 'none';
            clearBtn.style.display = 'flex';
        } else {
            pasteBtn.style.display = 'flex';
            clearBtn.style.display = 'none';
        }

        if (!url) {
            hidePreview();
            hideError();
            lastValidatedUrl = '';
            loadedVideoData = null;
            if (extractTimeout) clearTimeout(extractTimeout);
            return;
        }

        if (isValidTikTokUrl(url)) {
            if (url !== lastValidatedUrl) {
                lastValidatedUrl = url;
                loadedVideoData = null;
                showPreviewLoading();
                
                if (extractTimeout) clearTimeout(extractTimeout);
                extractTimeout = setTimeout(() => {
                    triggerPreviewExtraction(url);
                }, 400);
            }
        } else {
            hidePreview();
            lastValidatedUrl = '';
            loadedVideoData = null;
            if (extractTimeout) clearTimeout(extractTimeout);
        }
    });

    // --- Paste from Clipboard ---
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                urlInput.dispatchEvent(new Event('input'));
                urlInput.focus();
            }
        } catch (err) {
            urlInput.focus();
        }
    });

    // --- Clear Input ---
    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        urlInput.dispatchEvent(new Event('input'));
        urlInput.focus();
        hideError();
    });

    // --- Error Utilities ---
    function showError(msg) {
        errorMessage.textContent = msg;
        errorContainer.style.display = 'flex';
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideError() {
        errorContainer.style.display = 'none';
    }

    // --- TikTok URL Validation ---
    function isValidTikTokUrl(url) {
        const patterns = [
            /https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
            /https?:\/\/(www\.)?tiktok\.com\/t\/\w+/,
            /https?:\/\/vm\.tiktok\.com\/\w+/,
            /https?:\/\/m\.tiktok\.com\/v\/\d+/,
            /https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/photo\/\d+/,
            /https?:\/\/vt\.tiktok\.com\/\w+/,
        ];
        return patterns.some(p => p.test(url.trim()));
    }

    // --- API Extract Call ---
    async function extractVideoDetails() {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Por favor, cole um link do TikTok.');
            return null;
        }

        if (!isValidTikTokUrl(url)) {
            showError('Link do TikTok inválido. Insira um link válido.');
            return null;
        }

        hideError();
        return url;
    }

    // Disable/Enable main action buttons
    function setActionButtonsLoading(isLoading, buttonType) {
        const videoSvg = btnActionVideo.querySelector('svg');
        const audioSvg = btnActionAudio.querySelector('svg');

        if (isLoading) {
            btnActionVideo.disabled = true;
            btnActionAudio.disabled = true;
            if (buttonType === 'video') {
                btnActionVideo.querySelector('span').textContent = 'Buscando...';
            } else {
                btnActionAudio.querySelector('span').textContent = 'Buscando...';
            }
        } else {
            btnActionVideo.disabled = false;
            btnActionAudio.disabled = false;
            btnActionVideo.querySelector('span').textContent = 'Vídeo';
            btnActionAudio.querySelector('span').textContent = 'Áudio';
        }
    }

    // --- Clicking Video Button (Opens Popup) ---
    btnActionVideo.addEventListener('click', async () => {
        if (loadedVideoData && urlInput.value.trim() === lastValidatedUrl) {
            currentVideoUrl = loadedVideoData.url;
            openVideoModal();
            return;
        }

        const url = await extractVideoDetails();
        if (!url) return;

        setActionButtonsLoading(true, 'video');
        showPreviewLoading();

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();

            if (!response.ok) {
                showError(data.error || 'Erro ao processar o vídeo.');
                hidePreview();
                return;
            }

            loadedVideoData = data;
            lastValidatedUrl = url;
            currentVideoUrl = data.url;

            // Render loaded state
            previewLoader.style.display = 'none';
            previewPlaceholder.style.display = 'none';
            previewThumbnail.src = data.thumbnail;
            previewThumbnail.style.display = 'block';
            previewAuthor.textContent = `@${data.author}`;
            previewTitle.textContent = data.title;
            previewInfoOverlay.style.display = 'flex';

            // Open download options modal
            openVideoModal();
        } catch (err) {
            showError('Erro de conexão. Verifique sua internet e tente novamente.');
            hidePreview();
        } finally {
            setActionButtonsLoading(false, 'video');
        }
    });

    // --- Clicking Audio Button (Downloads directly with toast progress) ---
    btnActionAudio.addEventListener('click', async () => {
        if (loadedVideoData && urlInput.value.trim() === lastValidatedUrl) {
            currentVideoUrl = loadedVideoData.url;
            startAudioDownload(currentVideoUrl);
            return;
        }

        const url = await extractVideoDetails();
        if (!url) return;

        setActionButtonsLoading(true, 'audio');
        showPreviewLoading();

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();

            if (!response.ok) {
                showError(data.error || 'Erro ao processar o áudio.');
                hidePreview();
                return;
            }

            loadedVideoData = data;
            lastValidatedUrl = url;
            currentVideoUrl = data.url;

            // Render loaded state
            previewLoader.style.display = 'none';
            previewPlaceholder.style.display = 'none';
            previewThumbnail.src = data.thumbnail;
            previewThumbnail.style.display = 'block';
            previewAuthor.textContent = `@${data.author}`;
            previewTitle.textContent = data.title;
            previewInfoOverlay.style.display = 'flex';

            // Trigger direct audio download with toast
            startAudioDownload(currentVideoUrl);
        } catch (err) {
            showError('Erro de conexão. Verifique sua internet e tente novamente.');
            hidePreview();
        } finally {
            setActionButtonsLoading(false, 'audio');
        }
    });

    // --- Modal Control Functions ---
    function openVideoModal() {
        videoDownloadModal.style.display = 'flex';
        modalMainContent.style.display = 'block';
        modalProgressContainer.style.display = 'none';
        document.body.style.overflow = 'hidden'; // Lock body scroll
    }

    function closeVideoModal() {
        videoDownloadModal.style.display = 'none';
        document.body.style.overflow = ''; // Unlock body scroll
    }

    closeModalBtn.addEventListener('click', closeVideoModal);

    // Close modal when clicking outside card
    videoDownloadModal.addEventListener('click', (e) => {
        if (e.target === videoDownloadModal) {
            closeVideoModal();
        }
    });

    // --- Async Video Download inside Modal ---
    async function startModalVideoDownload(url, format) {
        // Switch view to progress indicator
        modalMainContent.style.display = 'none';
        modalProgressContainer.style.display = 'block';
        modalProgressBar.style.width = '0%';
        modalProgressPercent.textContent = '0%';
        modalProgressStatus.textContent = 'Iniciando download...';

        try {
            // 1. Request server-side download start
            const response = await fetch('/api/download/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url, format }),
            });

            const initData = await response.json();
            if (!response.ok) {
                throw new Error(initData.error || 'Erro ao iniciar o download.');
            }

            const downloadId = initData.download_id;

            // 2. Poll progress
            const interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/download/progress/${downloadId}`);
                    const progress = await res.json();

                    if (!res.ok) {
                        clearInterval(interval);
                        throw new Error(progress.error || 'Erro ao obter progresso.');
                    }

                    const percent = progress.percent || 0;
                    modalProgressBar.style.width = `${percent}%`;
                    modalProgressPercent.textContent = `${percent}%`;

                    if (progress.status === 'fetching_links') {
                        modalProgressStatus.textContent = 'Buscando links...';
                    } else if (progress.status === 'downloading') {
                        modalProgressStatus.textContent = 'Baixando vídeo no servidor...';
                    } else if (progress.status === 'done') {
                        clearInterval(interval);
                        modalProgressStatus.textContent = 'Salvo! Baixando para o seu dispositivo...';
                        modalProgressBar.style.width = '100%';
                        modalProgressPercent.textContent = '100%';

                        // Redirect browser to deliver local file attachment
                        setTimeout(() => {
                            window.location.href = `/api/download/file/${downloadId}`;
                            setTimeout(() => {
                                closeVideoModal();
                            }, 1500);
                        }, 500);
                    } else if (progress.status === 'error') {
                        clearInterval(interval);
                        throw new Error(progress.error_msg || 'Erro ao converter o vídeo.');
                    }
                } catch (err) {
                    clearInterval(interval);
                    modalProgressStatus.textContent = 'Erro ao baixar.';
                    alert(err.message);
                    closeVideoModal();
                }
            }, 500);

        } catch (err) {
            modalProgressStatus.textContent = 'Erro de inicialização.';
            alert(err.message);
            closeVideoModal();
        }
    }

    // Modal option button click handlers
    modalBtnFullHd.addEventListener('click', () => {
        if (currentVideoUrl) {
            startModalVideoDownload(currentVideoUrl, 'mp4_hd');
        }
    });

    modalBtn4k.addEventListener('click', () => {
        if (currentVideoUrl) {
            startModalVideoDownload(currentVideoUrl, 'mp4_4k');
        }
    });

    // --- Async Audio Download with Toast ---
    async function startAudioDownload(url) {
        audioProgressToast.style.display = 'block';
        audioProgressBar.style.width = '0%';
        audioProgressPercent.textContent = '0%';
        audioProgressStatus.textContent = 'Iniciando extração do áudio...';

        try {
            const response = await fetch('/api/download/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url, format: 'mp3' }),
            });

            const initData = await response.json();
            if (!response.ok) {
                throw new Error(initData.error || 'Erro ao processar áudio.');
            }

            const downloadId = initData.download_id;

            const interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/download/progress/${downloadId}`);
                    const progress = await res.json();

                    if (!res.ok) {
                        clearInterval(interval);
                        throw new Error(progress.error || 'Erro ao obter progresso.');
                    }

                    const percent = progress.percent || 0;
                    audioProgressBar.style.width = `${percent}%`;
                    audioProgressPercent.textContent = `${percent}%`;

                    if (progress.status === 'fetching_links') {
                        audioProgressStatus.textContent = 'Buscando áudio...';
                    } else if (progress.status === 'downloading') {
                        audioProgressStatus.textContent = 'Baixando áudio...';
                    } else if (progress.status === 'done') {
                        clearInterval(interval);
                        audioProgressStatus.textContent = 'Pronto! Baixando arquivo...';
                        audioProgressBar.style.width = '100%';
                        audioProgressPercent.textContent = '100%';

                        setTimeout(() => {
                            window.location.href = `/api/download/file/${downloadId}`;
                            setTimeout(() => {
                                audioProgressToast.style.display = 'none';
                            }, 1500);
                        }, 500);
                    } else if (progress.status === 'error') {
                        clearInterval(interval);
                        throw new Error(progress.error_msg || 'Erro na conversão.');
                    }
                } catch (err) {
                    clearInterval(interval);
                    audioProgressStatus.textContent = 'Erro no download.';
                    alert(err.message);
                    setTimeout(() => {
                        audioProgressToast.style.display = 'none';
                    }, 2000);
                }
            }, 500);

        } catch (err) {
            audioProgressStatus.textContent = 'Erro de conexão.';
            alert(err.message);
            setTimeout(() => {
                audioProgressToast.style.display = 'none';
            }, 2000);
        }
    }

    // --- FAQ Accordion ---
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(i => i.classList.remove('active'));
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // --- Header Scroll Effect ---
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.background = 'rgba(6, 2, 17, 0.95)';
            header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
        } else {
            header.style.background = 'transparent';
            header.style.boxShadow = 'none';
        }
    }, { passive: true });

    // --- Smooth Scroll for Nav Links ---
    document.querySelectorAll('.nav-link[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            e.preventDefault();
            const target = document.querySelector(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
