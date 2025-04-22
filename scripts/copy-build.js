const fs = require('fs-extra');
const path = require('path');

const sourceBuildPath = path.join(__dirname, '../../frontend/build');
const targetBuildPath = path.join(__dirname, '../public');

// Ensure the public directory exists
fs.ensureDirSync(targetBuildPath);

// Remove existing build files if any
fs.removeSync(targetBuildPath);

// Copy the new build files
fs.copySync(sourceBuildPath, targetBuildPath);

console.log('Build files copied successfully to backend/public directory!'); 