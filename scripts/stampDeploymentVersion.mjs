import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function versionModuleSpecifiers(source, version){
  const stamp = (_match, before, specifier, after) => {
    if(!specifier.startsWith('.') && !specifier.startsWith('/')) return `${before}${specifier}${after}`;
    return `${before}${specifier}?v=${version}${after}`;
  };
  return source
    .replace(/(\bfrom\s*['"])([^'"]+\.js)(['"])/g, stamp)
    .replace(/(\bimport\s*['"])([^'"]+\.js)(['"])/g, stamp)
    .replace(/(\bimport\s*\(\s*['"])([^'"]+\.js)(['"]\s*\))/g, stamp);
}

export function versionCssImports(source, version){
  return source.replace(/(@import\s+url\(["'])([^"']+\.css)(?:\?v=[^"']*)?(["']\))/g,
    (_match, before, specifier, after) => `${before}${specifier}?v=${version}${after}`);
}

async function javascriptFiles(directory){
  const entries = await readdir(directory, { withFileTypes:true });
  const nested = await Promise.all(entries.map(async entry => {
    const target = path.join(directory, entry.name);
    if(entry.isDirectory()) return javascriptFiles(target);
    if(entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) return [target];
    return [];
  }));
  return nested.flat();
}

export async function stampDeployment(version, root=process.cwd()){
  if(!version) throw new Error('Deployment version is required');
  const files = await javascriptFiles(path.join(root, 'src'));
  for(const file of files){
    const source = await readFile(file, 'utf8');
    const versioned = versionModuleSpecifiers(source, version);
    if(versioned !== source) await writeFile(file, versioned);
  }
  for(const relative of ['index.html','src/bootstrap/cacheGuard.js','sw.js']){
    const file = path.join(root, relative);
    const source = await readFile(file, 'utf8');
    await writeFile(file, source.replaceAll('__DEPLOYMENT_VERSION__', version));
  }
  const cssManifest = path.join(root, 'src/styles/index.css');
  const cssSource = await readFile(cssManifest, 'utf8');
  await writeFile(cssManifest, versionCssImports(cssSource, version));
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  await stampDeployment(process.argv[2]);
}
