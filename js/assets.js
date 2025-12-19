class Assets {
    constructor() {
        this.images = {};
        this.sounds = {};
        this.toLoad = 0;
        this.loaded = 0;
        this.audioContext = null;
        this.isAudioEnabled = false;

        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            this.isAudioEnabled = true;
        } catch (e) {
            console.warn('Web Audio API not supported.');
        }

        this.activeSounds = {}; // Track playing sounds (mainly for loops)
    }

    loadImage(key, src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images[key] = img;
                this.loaded++;
                resolve(img);
            };
            img.onerror = (e) => {
                console.error(`Failed to load image: ${src}`, e);
                reject(e);
            };
            img.src = src;
            this.toLoad++;
        });
    }

    loadAudio(key, src) {
        if (!this.isAudioEnabled) return Promise.resolve();

        return new Promise((resolve, reject) => {
            fetch(src)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.arrayBuffer();
                })
                .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
                .then(audioBuffer => {
                    this.sounds[key] = audioBuffer;
                    this.loaded++;
                    resolve(audioBuffer);
                })
                .catch(e => {
                    console.warn(`Web Audio fetch failed for ${src}, falling back to HTML5 Audio`, e);
                    // Fallback to HTML5 Audio (works for file://)
                    const audio = new Audio(src);
                    audio.oncanplaythrough = () => {
                        this.sounds[key] = audio;
                        this.loaded++;
                        resolve(audio);
                        // Remove listener to avoid multiple resolves if it fires again
                        audio.oncanplaythrough = null;
                    };
                    audio.onerror = (err) => {
                        console.error(`Failed to load audio fallback: ${src}`, err);
                        resolve(null);
                    };
                    // Trigger load
                    audio.load();
                });
            this.toLoad++;
        });
    }

    getImage(key) {
        return this.images[key];
    }

    stopAudio(key) {
        if (this.activeSounds[key]) {
            const sound = this.activeSounds[key];
            if (sound.stop) { // Web Audio Source
                try {
                    sound.stop();
                    sound.disconnect();
                } catch (e) {
                    // Ignore errors if already stopped
                }
            } else if (sound.pause) { // HTML5 Audio
                sound.pause();
                sound.currentTime = 0;
            }
            delete this.activeSounds[key];
        }
    }

    playAudio(key, volume = 1.0, loop = false) {
        if (!this.isAudioEnabled || !this.sounds[key]) return;

        // If it's a looping sound, stop previous instance to avoid overlap
        if (loop) {
            this.stopAudio(key);
        }

        if (this.sounds[key] instanceof AudioBuffer) {
            // Web Audio API
            const source = this.audioContext.createBufferSource();
            source.buffer = this.sounds[key];
            source.loop = loop;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volume;

            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            source.start(0);

            if (loop) {
                this.activeSounds[key] = source;
            }
        } else if (this.sounds[key] instanceof HTMLAudioElement) {
            // HTML5 Audio Fallback
            const sound = this.sounds[key].cloneNode();
            sound.volume = volume;
            sound.loop = loop;
            sound.play().catch(e => console.error("Audio play failed", e));

            if (loop) {
                this.activeSounds[key] = sound;
            }
        }
    }

    resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    async loadAll(onProgress) {
        const assets = [
            { key: 'player', src: 'images/grinch_rocket.svg', type: 'image' },
            { key: 'invader1', src: 'images/ornament_1.svg', type: 'image' },
            { key: 'invader2', src: 'images/ornament_2.svg', type: 'image' },
            { key: 'invader3', src: 'images/ornament_3.svg', type: 'image' },
            { key: 'projectile', src: 'images/projectile.svg', type: 'image' },
            { key: 'santa', src: 'images/santa_sleigh.svg', type: 'image' },
            { key: 'gift', src: 'images/bad_gift.svg', type: 'image' },
            { key: 'powerup_fast', src: 'images/powerup_fast.svg', type: 'image' },
            { key: 'powerup_life', src: 'images/powerup_life.svg', type: 'image' },
            { key: 'powerup_slow', src: 'images/powerup_slow.svg', type: 'image' },
            { key: 'shoot', src: 'sounds/gun.mp3', type: 'audio' },
            { key: 'rotura', src: 'sounds/rotura.mp3', type: 'audio' },
            { key: 'danio', src: 'sounds/danio.mp3', type: 'audio' },
            { key: 'explosion', src: 'sounds/explosion.mp3', type: 'audio' },
            { key: 'caida', src: 'sounds/caida.mp3', type: 'audio' },
            { key: 'caida_regalos', src: 'sounds/caida_regalos.mp3', type: 'audio' },
            { key: 'powerup', src: 'sounds/powerup.mp3', type: 'audio' },
            { key: 'music', src: 'sounds/music.mp3', type: 'audio' },
            { key: 'hohoho', src: 'sounds/hohoho.mp3', type: 'audio' }
        ];

        try {
            const promises = assets.map(asset => {
                const promise = asset.type === 'audio'
                    ? this.loadAudio(asset.key, asset.src)
                    : this.loadImage(asset.key, asset.src);

                return promise.then(() => {
                    if (onProgress) {
                        const percent = Math.floor((this.loaded / assets.length) * 100);
                        onProgress(percent);
                    }
                });
            });
            await Promise.all(promises);
            console.log('All assets loaded');
            // Ensure 100% is called
            if (onProgress) onProgress(100);
            return true;
        } catch (error) {
            console.error('Error loading assets:', error);
            return false;
        }
    }
}

window.gameAssets = new Assets();
