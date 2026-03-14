class GodotChunkLoader {
    constructor() {
        this.cache = new Map();
    }

    async loadChunkedFile(manifestUrl, progressCallback) {
        try {
            const manifestResponse = await fetch(manifestUrl);
            if (!manifestResponse.ok) {
                throw new Error(`Failed to load manifest: ${manifestResponse.status}`);
            }
            const manifest = await manifestResponse.json();
            
            const cacheKey = `${manifest.originalFile}_${manifest.fileSize}`;
            if (this.cache.has(cacheKey)) {
                console.log(`Using cached version of ${manifest.originalFile}`);
                return this.cache.get(cacheKey);
            }

            const chunks = [];
            const baseName = manifest.originalFile.replace(/\.[^/.]+$/, '');
            const ext = manifest.originalFile.substring(manifest.originalFile.lastIndexOf('.'));
            
            for (let i = 0; i < manifest.totalChunks; i++) {
                const chunkFileName = `${baseName}.part${i.toString().padStart(3, '0')}${ext}`;
                
                try {
                    const response = await fetch(chunkFileName);
                    if (!response.ok) {
                        throw new Error(`Failed to load chunk ${i}: ${response.status}`);
                    }
                    const chunk = await response.arrayBuffer();
                    chunks.push(chunk);
                    
                    if (progressCallback) {
                        const progress = ((i + 1) / manifest.totalChunks) * 100;
                        progressCallback(progress, `Loading ${manifest.originalFile}: chunk ${i + 1}/${manifest.totalChunks}`);
                    }
                } catch (error) {
                    console.error(`Error loading chunk ${i}:`, error);
                    throw error;
                }
            }

            const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const mergedBuffer = new Uint8Array(totalSize);
            let offset = 0;
            
            for (const chunk of chunks) {
                mergedBuffer.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            this.cache.set(cacheKey, mergedBuffer);
            console.log(`Successfully loaded and merged ${manifest.originalFile} (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
            return mergedBuffer;

        } catch (error) {
            console.error('Error loading chunked file:', error);
            throw error;
        }
    }

    async setupGodotFS(engine) {
        try {
            const pckData = await this.loadChunkedFile('index.manifest.json', (progress, message) => {
                console.log(message);
            });

            // Override the engine's preRun to inject the PCK file into Godot's file system
            const originalPreRun = engine.preRun || (() => {});
            engine.preRun = () => {
                // Wait for Godot's file system to be available
                if (typeof engine.FS !== 'undefined' && engine.FS.writeFile) {
                    engine.FS.writeFile('/index.pck', pckData);
                    console.log('PCK file injected into Godot file system');
                } else {
                    // If FS isn't ready yet, try again after a short delay
                    setTimeout(() => {
                        if (typeof engine.FS !== 'undefined' && engine.FS.writeFile) {
                            engine.FS.writeFile('/index.pck', pckData);
                            console.log('PCK file injected into Godot file system (delayed)');
                        } else {
                            console.warn('Godot FS not available, PCK file may not be loaded correctly');
                        }
                    }, 100);
                }
                originalPreRun();
            };

            return true;
        } catch (error) {
            console.error('Error setting up Godot FS:', error);
            throw error;
        }
    }
}

window.GodotChunkLoader = GodotChunkLoader;
