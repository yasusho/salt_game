const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        function playTone(freq, type, duration, delay = 0) {
            setTimeout(() => {
                try {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
                    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start();
                    osc.stop(audioCtx.currentTime + duration);
                } catch (e) {
                    console.log("Audio play error", e);
                }
            }, delay);
        }

        const sound = {
            click: () => playTone(550, 'sine', 0.08),
            draw: () => playTone(780, 'triangle', 0.1),
            stand: () => {
                playTone(450, 'sine', 0.12);
                playTone(650, 'sine', 0.12, 60);
            },
            burst: () => {
                playTone(280, 'sawtooth', 0.4);
                playTone(200, 'sawtooth', 0.4, 100);
            },
            coin: () => {
                playTone(880, 'sine', 0.08);
                playTone(1046, 'sine', 0.15, 60);
            },
            step: () => playTone(380, 'triangle', 0.06),
            explosion: () => {
                playTone(140, 'triangle', 0.6);
                playTone(80, 'sawtooth', 0.6, 20);
                playTone(220, 'square', 0.4, 50);
            },
            fanfare: () => {
                playTone(523, 'sine', 0.15);
                playTone(659, 'sine', 0.15, 120);
                playTone(784, 'sine', 0.15, 240);
                playTone(1046, 'sine', 0.4, 360);
            }
        };

        function resumeAudio() {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }