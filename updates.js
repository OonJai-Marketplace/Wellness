/* App-shell updates are separate from the browser/OS installed-icon refresh. */
(()=>{
 // Read the version of the app actually loaded by this page, not a second release constant.
 const appScript=document.querySelector('script[type="module"][src*="app.js"]');
 const VERSION=appScript?new URL(appScript.src,document.baseURI).searchParams.get('v'):null;
 const versionParts=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value)?value.split('.').map(Number):null;
 const newer=(candidate,current)=>{const a=versionParts(candidate),b=versionParts(current);if(!a||!b)throw Error('invalid version');for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;};
 let registration,pendingVersion=null,checking=false,updating=false;
 const notice=document.createElement('div');
 notice.id='appUpdateNotice';notice.hidden=true;notice.setAttribute('role','status');
 notice.innerHTML='<span>A Wellness update is ready.</span><button type="button">Update now</button>';
 document.body.append(notice);
 const label=notice.querySelector('span'),button=notice.querySelector('button');
 const status=message=>{const target=document.getElementById('updateStatus');if(target)target.textContent=message;};
 const display=()=>{label.textContent='Wellness '+pendingVersion+' is ready.';notice.hidden=false;status('An update is ready. Save your changes, then choose Update now.');};
 const clear=()=>{pendingVersion=null;notice.hidden=true;status('You have the latest app version ('+VERSION+').');};
 async function check(manual=false){
  if(checking||updating)return;checking=true;
  try{
   if(!navigator.onLine)throw Error('offline');
   const response=await fetch('./version.json',{cache:'no-store'});
   if(!response.ok)throw Error('unavailable');
   const release=await response.json();
   // A temporarily older manifest must not offer a downgrade.
   if(newer(release.version,VERSION)){pendingVersion=release.version;display();}else clear();
   // A worker-check failure must not restore a stale notification.
   if(registration)try{await registration.update();}catch{}
  }catch{if(manual)status('Unable to check right now. Connect to the internet and try again.');}
  finally{checking=false;}
 }
 async function waitForWorker(worker){
  if(!worker||worker.state==='activated')return;
  if(worker.state==='redundant')throw Error('Update installation failed');
  await new Promise((resolve,reject)=>{
   const finish=error=>{clearTimeout(timeout);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};
   const changed=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(Error('Update installation failed'));};
   const timeout=setTimeout(()=>finish(Error('Update still installing')),15000);
   worker.addEventListener('statechange',changed);changed();
  });
 }
 button.onclick=async()=>{
  if(updating||!pendingVersion)return;
  if(document.querySelector('dialog[open]')){status('Save or close your open form before updating.');alert('Save or close your open form first. Your saved records will remain.');return;}
  if(!navigator.onLine){label.textContent='Connect to the internet to finish the update.';return;}
  updating=true;button.disabled=true;button.textContent='Updating…';
  // Saved records and encrypted phone storage are never cleared.
  try{
   if(registration){await registration.update();await waitForWorker(registration.installing||registration.waiting);}
   notice.hidden=true;window.location.reload();
  }catch{notice.hidden=false;label.textContent='Update is not ready yet. Please try again.';status('Unable to finish the update. Your saved records are safe.');}
  finally{updating=false;button.disabled=false;button.textContent='Update now';}
 };
 window.wellnessUpdates={check,version:VERSION};
 document.addEventListener('click',event=>{if(event.target.closest('[data-action="checkupdates"]'))check(true);});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
 window.addEventListener('online',()=>check());
 if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{registration=reg;return check();}).catch(()=>check());}
 else check();
 setInterval(()=>{if(document.visibilityState==='visible')check();},300000);
})();
