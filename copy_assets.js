const fs = require('fs');
const path = require('path');

const files = [
  { 
    src: 'C:\\Users\\9999\\.gemini\\antigravity\\brain\\aac9c502-12e6-42a5-87ed-d115b0f2ee80\\app_icon_1773478736116.png', 
    dest: 'c:\\code\\c2026-03-09-management-project-app\\assets\\icon.png' 
  },
  { 
    src: 'C:\\Users\\9999\\.gemini\\antigravity\\brain\\aac9c502-12e6-42a5-87ed-d115b0f2ee80\\hero_illustration_1773478755769.png', 
    dest: 'c:\\code\\c2026-03-09-management-project-app\\assets\\hero.png' 
  }
];

files.forEach(f => {
  try {
    fs.copyFileSync(f.src, f.dest);
    console.log(`Copied ${f.src} to ${f.dest}`);
  } catch (err) {
    console.error(`Error copying ${f.src}:`, err);
  }
});
