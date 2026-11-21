import {zipFunctions} from '@netlify/zip-it-and-ship-it';
const [src,out]=process.argv.slice(2);
const r=await zipFunctions(src,out,{config:{'*':{nodeBundler:'esbuild'}},basePath:process.cwd(),repositoryRoot:process.cwd()});
console.log(JSON.stringify(r.map(f=>({name:f.name,path:f.path,runtime:f.runtime,runtimeAPIVersion:f.runtimeAPIVersion,bootstrapVersion:f.bootstrapVersion,invocationMode:f.invocationMode,generator:f.generator}))));
