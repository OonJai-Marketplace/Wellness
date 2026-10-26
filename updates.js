/* App-shell updates are separate from the browser/OS installed-icon refresh. */
(()=>{
 const VERSION='1.1.0';
 let registration, pendingVersion, checking=false;
 const notice=document.createElement('div');
 notice.id='appUpdateNotice';notice.hidden=true;notice.setAttribute('role','status');
 notice.innerHTML='<span>A Wellness update is ready.</span><button type="button">Update now</button>';
 document.body.append(notice);
 const status=message=>{const target=document.getElementById('updateStatus');if(target)target.textContent=message;};
 const display=()=>{notice.hidden=false;status('An update is ready. Save your changes, then choose Update now.');};
 async function check(manual=false){
  if(checking)return;checking=true;
  try{
   if(!navigator.onLine)throw Error('offline');
   const response=await fetch('./version.json',{cache:'no-store'});
   if(!response.ok)throw Error('unavailable');
   const release=await response.json();
   if(typeof release.version!=='string')throw Error('invalid');
   if(registration)await registration.update();
   if(release.version!==VERSION){pendingVersion=release.version;display();}
   else status('You have the latest app version ('+VERSION+'). Home-screen icon updates are managed by your browser.');
  }catch{if(manual)status('Unable to check right now. Connect to the internet and try again.');}
  finally{checking=false;}
 }
 notice.querySelector('button').onclick=async()=>{
  if(document.querySelector('dialog[open]')){status('Save or close your open form before updating.');alert('Save or close your open form first. Your saved records will remain.');return;}
  // Do not clear storage or reload automatically while someone is editing.
  try{if(registration)await registration.update();}catch{}
  window.location.reload();
 };
 window.wellnessUpdates={check,version:VERSION};
 document.addEventListener('click',event=>{if(event.target.closest('[data-action="checkupdates"]'))check(true);});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
 window.addEventListener('online',()=>check());
 if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{registration=reg;return check();}).catch(()=>check());}
 else check();
 setInterval(()=>{if(document.visibilityState==='visible')check();},300000);
})();
