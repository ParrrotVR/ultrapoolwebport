class GodotChunkLoader {
    constructor() {
        this.cache = new Map();
        this.pckData = null;
        this.wasmData = null;
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
            // Load both PCK and WASM files
            console.log('Loading PCK file...');
            this.pckData = await this.loadChunkedFile('index.manifest.json', (progress, message) => {
                console.log(message);
            });

            console.log('Loading WASM file...');
            this.wasmData = await this.loadChunkedFile('index.wasm.manifest.json', (progress, message) => {
                console.log(message);
            });

            // Intercept fetch calls to return our loaded data
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
                if (url.endsWith('index.pck')) {
                    console.log('Intercepting PCK file request');
                    return Promise.resolve(new Response(this.pckData, {
                        status: 200,
                        headers: { 'Content-Type': 'application/octet-stream' }
                    }));
                }
                if (url.endsWith('index.wasm')) {
                    console.log('Intercepting WASM file request');
                    return Promise.resolve(new Response(this.wasmData, {
                        status: 200,
                        headers: { 'Content-Type': 'application/wasm' }
                    }));
                }
                return originalFetch(url, options);
            }.bind(this);

            // Also inject PCK into Godot's file system if available
            const originalPreRun = engine.preRun || (() => {});
            engine.preRun = () => {
                if (typeof engine.FS !== 'undefined' && engine.FS.writeFile) {
                    engine.FS.writeFile('/index.pck', this.pckData);
                    console.log('PCK file injected into Godot file system');
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
