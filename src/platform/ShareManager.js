/**
 * ShareManager - SNS sharing with image generation
 * Creates shareable images and URLs with UTM tracking
 */
export class ShareManager {
    constructor() {
        this.baseUrl = window.location.origin + window.location.pathname;

        // Challenge phrases for viral sharing
        this.challengePhrases = [
            'Can you beat this score?',
            'Try one more run!',
            'Challenge accepted!',
            'This one is harder than it looks.',
            'New record unlocked!',
            'Beat me if you can!'
        ];
    }

    /**
     * Show share modal
     */
    showShareModal(data) {
        const modal = this.createShareModal(data);
        document.body.appendChild(modal);

        // Generate share image
        this.generateShareImage(data).then(imageUrl => {
            const preview = modal.querySelector('.share-preview');
            if (preview && imageUrl) {
                preview.src = imageUrl;
                preview.style.display = 'block';
            }
        });
    }

    /**
     * Create share modal element
     */
    createShareModal(data) {
        const modal = document.createElement('div');
        modal.className = 'share-modal-overlay glass-overlay animate-fadeIn';
        modal.innerHTML = `
            <div class="share-modal glass-modal animate-fadeInScale">
                <div class="share-header">
                    <h2 class="font-display neon-text-cyan">Share Score</h2>
                    <button class="close-btn glass-btn" id="closeShareBtn">Close</button>
                </div>
                
                <div class="share-content">
                    <div class="share-preview-container">
                        <img class="share-preview" style="display: none;" alt="Share preview">
                        <div class="share-loading">
                            <div class="spinner animate-spin"></div>
                            <span>Generating image...</span>
                        </div>
                    </div>
                    
                    <div class="share-stats glass-card">
                        <div class="share-stat">
                            <span class="label">Game</span>
                            <span class="value">${data.gameName}</span>
                        </div>
                        <div class="share-stat">
                            <span class="label">High Score</span>
                            <span class="value neon-text-yellow">${data.highScore.toLocaleString()}</span>
                        </div>
                        <div class="share-stat">
                            <span class="label">Plays</span>
                            <span class="value">${data.playCount}x</span>
                        </div>
                    </div>
                    
                    <div class="challenge-phrase neon-text-pink">
                        "${this.getRandomPhrase()}"
                    </div>
                    
                    <div class="share-buttons">
                        <button class="share-btn-item glass-btn" data-platform="twitter">
                            <span class="icon">X</span>
                            <span>Twitter</span>
                        </button>
                        <button class="share-btn-item glass-btn" data-platform="facebook">
                            <span class="icon">f</span>
                            <span>Facebook</span>
                        </button>
                        <button class="share-btn-item glass-btn" data-platform="kakao">
                            <span class="icon">K</span>
                            <span>KakaoTalk</span>
                        </button>
                        <button class="share-btn-item glass-btn" data-platform="copy">
                            <span class="icon">#</span>
                            <span>Copy Link</span>
                        </button>
                    </div>
                    
                    <button class="download-btn neon-btn" id="downloadImageBtn">
                        Download Image
                    </button>
                </div>
            </div>
        `;

        this.addShareStyles();
        this.setupModalEvents(modal, data);

        return modal;
    }

    /**
     * Add share modal styles
     */
    addShareStyles() {
        if (document.getElementById('share-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'share-styles';
        styles.textContent = `
            .share-modal-overlay {
                position: fixed;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: var(--z-overlay);
                padding: var(--space-4);
            }
            
            .share-modal {
                width: 100%;
                max-width: 360px;
                max-height: 90vh;
                overflow-y: auto;
                padding: var(--space-5);
            }
            
            .share-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--space-4);
            }
            
            .share-header h2 {
                font-size: var(--font-size-lg);
            }
            
            .close-btn {
                padding: var(--space-2);
                line-height: 1;
            }
            
            .share-preview-container {
                position: relative;
                margin-bottom: var(--space-4);
                border-radius: var(--radius-lg);
                overflow: hidden;
                background: var(--bg-secondary);
                min-height: 180px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .share-preview {
                width: 100%;
                border-radius: var(--radius-lg);
            }
            
            .share-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: var(--space-2);
                color: var(--text-muted);
            }
            
            .spinner {
                width: 24px;
                height: 24px;
                border: 2px solid var(--neon-cyan);
                border-top-color: transparent;
                border-radius: 50%;
            }
            
            .share-stats {
                display: flex;
                justify-content: space-around;
                padding: var(--space-3);
                margin-bottom: var(--space-3);
            }
            
            .share-stat {
                text-align: center;
            }
            
            .share-stat .label {
                display: block;
                font-size: var(--font-size-xs);
                color: var(--text-muted);
            }
            
            .share-stat .value {
                font-family: var(--font-display);
                font-size: var(--font-size-md);
            }
            
            .challenge-phrase {
                text-align: center;
                font-size: var(--font-size-md);
                font-style: italic;
                margin-bottom: var(--space-4);
            }
            
            .share-buttons {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: var(--space-2);
                margin-bottom: var(--space-4);
            }
            
            .share-btn-item {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: var(--space-2);
                padding: var(--space-3);
            }
            
            .share-btn-item .icon {
                font-size: var(--font-size-lg);
            }
            
            .download-btn {
                width: 100%;
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Setup modal event listeners
     */
    setupModalEvents(modal, data) {
        // Close button
        modal.querySelector('#closeShareBtn').onclick = () => modal.remove();

        // Click outside to close
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        // Share buttons
        modal.querySelectorAll('.share-btn-item').forEach(btn => {
            btn.onclick = () => this.share(btn.dataset.platform, data);
        });

        // Download button
        modal.querySelector('#downloadImageBtn').onclick = () => {
            this.downloadShareImage(data);
        };
    }

    /**
     * Generate share image using canvas
     */
    async generateShareImage(data) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 315; // 1.91:1 ratio for social sharing
        const ctx = canvas.getContext('2d');

        // Background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0a0a0f');
        gradient.addColorStop(0.5, '#12121a');
        gradient.addColorStop(1, '#0a0a0f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid pattern
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i < canvas.width; i += 30) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i < canvas.height; i += 30) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(canvas.width, i);
            ctx.stroke();
        }

        // Platform name
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.fillStyle = '#00f2ff';
        ctx.shadowColor = '#00f2ff';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'left';
        ctx.fillText('MINIGAME FACTORY', 30, 40);
        ctx.shadowBlur = 0;

        // Game name
        ctx.font = 'bold 28px "Noto Sans KR", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(data.gameName, 30, 80);

        // Score
        ctx.font = 'bold 72px Orbitron, sans-serif';
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 20;
        ctx.textAlign = 'center';
        ctx.fillText(data.highScore.toLocaleString(), canvas.width / 2, 170);
        ctx.shadowBlur = 0;

        ctx.font = '16px "Noto Sans KR", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText('HIGH SCORE', canvas.width / 2, 200);

        // Player name
        ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
        ctx.fillStyle = '#ff00ff';
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'left';
        ctx.fillText(`PLAYER ${data.playerName}`, 30, 270);
        ctx.shadowBlur = 0;

        // Challenge text
        ctx.font = 'bold 18px "Noto Sans KR", sans-serif';
        ctx.fillStyle = '#00f2ff';
        ctx.textAlign = 'right';
        ctx.fillText(this.getRandomPhrase(), canvas.width - 30, 270);

        return canvas.toDataURL('image/png');
    }

    /**
     * Download share image
     */
    async downloadShareImage(data) {
        const dataUrl = await this.generateShareImage(data);
        const link = document.createElement('a');
        link.download = `${data.gameName}_score_${data.highScore}.png`;
        link.href = dataUrl;
        link.click();
    }

    /**
     * Generate share URL with UTM parameters
     */
    generateShareUrl(data) {
        const params = new URLSearchParams({
            utm_source: 'share',
            utm_medium: 'social',
            utm_campaign: data.gameId,
            game: data.gameId,
            challenge: data.highScore,
            player: encodeURIComponent(data.playerName)
        });

        return `${this.baseUrl}?${params.toString()}`;
    }

    /**
     * Share to platform
     */
    share(platform, data) {
        const url = this.generateShareUrl(data);
        const text = '[MINIGAME] ' + data.gameName + ' - ' + data.highScore.toLocaleString() + ' points! ' + this.getRandomPhrase();

        switch (platform) {
            case 'twitter':
                window.open(
                    'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url),
                    '_blank',
                    'width=600,height=400'
                );
                break;

            case 'facebook':
                window.open(
                    'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url) + '&quote=' + encodeURIComponent(text),
                    '_blank',
                    'width=600,height=400'
                );
                break;

            case 'kakao':
                // Kakao SDK would be integrated here
                // For now, copy link as fallback
                this.copyToClipboard(text + '\n' + url);
                this.showToast('Link copied. Paste it in KakaoTalk.');
                break;

            case 'copy':
                this.copyToClipboard(url);
                this.showToast('Link copied.');
                break;
        }
    }

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        }
    }

    /**
     * Show toast notification
     */
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'share-toast glass-card animate-fadeInUp';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            padding: var(--space-3) var(--space-5);
            z-index: var(--z-toast);
            font-size: var(--font-size-sm);
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('animate-fadeOut');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * Get random challenge phrase
     */
    getRandomPhrase() {
        return this.challengePhrases[Math.floor(Math.random() * this.challengePhrases.length)];
    }
}
