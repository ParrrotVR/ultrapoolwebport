class FileChunkLoader {
    constructor() {
        this.cache = new Map();
    }

    async loadChunkedFile(manifestUrl, progressCallback) {
        try {
            // Load manifest
            const manifestResponse = await fetch(manifestUrl);
            if (!manifestResponse.ok) {
                throw new Error(`Failed to load manifest: ${manifestResponse.status}`);
            }
            const manifest = await manifestResponse.json();
            
            // Check if already cached
            const cacheKey = `${manifest.originalFile}_${manifest.fileSize}`;
            if (this.cache.has(cacheKey)) {
                console.log(`Using cached version of ${manifest.originalFile}`);
                return this.cache.get(cacheKey);
            }

            // Load all chunks
            const chunks = [];
            const baseName = manifest.originalFile.replace(/\.[^/.]+$/, '');
            const ext = manifest.originalFile.substring(manifest.originalFile.lastIndexOf('.'));
            
            for (let i = 0; i < manifest.totalChunks; i++) {
                const chunkFileName = `${baseName}.part${i.toString().padStart(3, '0')}${ext}`;
                const chunkUrl = chunkFileName;
                
                try {
                    const response = await fetch(chunkUrl);
                    if (!response.ok) {
                        throw new Error(`Failed to load chunk ${i}: ${response.status}`);
                    }
                    const chunk = await response.arrayBuffer();
                    chunks.push(chunk);
                    
                    // Report progress
                    if (progressCallback) {
                        const progress = ((i + 1) / manifest.totalChunks) * 100;
                        progressCallback(progress, `Loading ${manifest.originalFile}: chunk ${i + 1}/${manifest.totalChunks}`);
                    }
                } catch (error) {
                    console.error(`Error loading chunk ${i}:`, error);
                    throw error;
                }
            }

            // Merge chunks
            const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const mergedBuffer = new Uint8Array(totalSize);
            let offset = 0;
            
            for (const chunk of chunks) {
                mergedBuffer.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            // Cache the result
            this.cache.set(cacheKey, mergedBuffer);
            
            console.log(`Successfully loaded and merged ${manifest.originalFile} (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
            return mergedBuffer;

        } catch (error) {
            console.error('Error loading chunked file:', error);
            throw error;
        }
    }

    async loadFileWithFallback(filename, progressCallback) {
        // First try to load as chunked file
        const manifestUrl = `${filename.replace(/\.[^/.]+$/, '')}.manifest.json`;
        
        try {
            const manifestResponse = await fetch(manifestUrl);
            if (manifestResponse.ok) {
                console.log(`Loading ${filename} as chunked file...`);
                return await this.loadChunkedFile(manifestUrl, progressCallback);
            }
        } catch (error) {
            console.log(`Manifest not found for ${filename}, trying direct load...`);
        }

        // Fallback to direct file loading
        try {
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`Failed to load ${filename}: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            console.log(`Loaded ${filename} directly (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB)`);
            return new Uint8Array(arrayBuffer);
        } catch (error) {
            console.error(`Failed to load ${filename} directly:`, error);
            throw error;
        }
    }
}

// Export for use in main script
window.FileChunkLoader = FileChunkLoader;
