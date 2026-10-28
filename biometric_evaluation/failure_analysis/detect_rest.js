'use strict';
const fs=require('fs'), path=require('path');
const { Canvas, Image, ImageData } = require('canvas');
require('@tensorflow/tfjs-node');
const faceapi=require('face-api.js');
const ROOT=path.resolve(__dirname,'..','..');
const MODELS=path.join(ROOT,'frontend','public','models');
const EVAL=path.join(ROOT,'biometric_evaluation');
const OUT=path.join(EVAL,'failure_analysis','experiments');
const failed=JSON.parse(fs.readFileSync(path.join(EVAL,'failure_analysis','failed_images_metadata.json'),'utf8'));
(async()=>{
  faceapi.env.monkeyPatch({Canvas,Image,ImageData});
  await Promise.all([faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS),faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS),faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS)]);
  for (const t of [0.4,0.5]){
    let detected=0, errors=0; const per=[];
    for (const m of failed){
      const full=path.join(ROOT,m.path);
      try{
        const buf=fs.readFileSync(full);
        const img=new Image(); img.src=buf;
        const det=await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({minConfidence:t}));
        if(det){detected++; per.push({path:m.path,detected:true,score:det.score??null});}
        else per.push({path:m.path,detected:false});
      }catch(e){errors++; per.push({path:m.path,error:e.message});}
    }
    fs.writeFileSync(path.join(OUT,`ssd_minConf_${t}.json`), JSON.stringify({threshold:t,summary:{detected,errors,total:failed.length,rate:detected/failed.length},detections:per},null,2));
    console.log('threshold',t,'detected',detected,'/',failed.length,'errors',errors);
  }
  console.log('DONE');
})();
