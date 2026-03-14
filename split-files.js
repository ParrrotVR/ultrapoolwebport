const fs = require('fs');
const path = require('path');

function splitFile(filePath, chunkSize = 24 * 1024 * 1024) { // 24MB chunks
    const fileBuffer = fs.readFileSync(filePath);
    const fileSize = fileBuffer.length;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    console.log(`Splitting ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)}MB) into ${totalChunks} chunks...`);
    
    const baseName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunk = fileBuffer.slice(start, end);
        
        const chunkFileName = `${baseName}.part${i.toString().padStart(3, '0')}${ext}`;
        const chunkPath = path.join(dir, chunkFileName);
        
        fs.writeFileSync(chunkPath, chunk);
        console.log(`Created: ${chunkFileName} (${(chunk.length / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    // Create manifest file
    const manifest = {
        originalFile: path.basename(filePath),
        totalChunks: totalChunks,
        chunkSize: chunkSize,
        fileSize: fileSize
    };
    
    const manifestPath = path.join(dir, `${baseName}.manifest.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Created manifest: ${path.basename(manifestPath)}`);
    
    return manifest;
}

// Split the large files
const pckManifest = splitFile('./index.pck');
const wasmManifest = splitFile('./index.wasm');

console.log('\nSplitting complete!');
console.log('Files ready for GitHub Pages deployment.');
