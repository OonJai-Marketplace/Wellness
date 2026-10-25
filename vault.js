// Encrypted at rest; password and key never stored. Web Locks serialize phone tabs.
const encoder=new TextEncoder(),decoder=new TextDecoder();
const database=new Promise((resolve,reject)=>{const r=indexedDB.open('oonjai-wellness-restaurant-secure-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('vaults');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function read(id){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction('vaults').objectStore('vaults').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function write(id,value){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('vaults','readwrite');tx.objectStore('vaults').put(value,id);tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('Storage failed.'));});}
async function derive(password,salt){const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encrypt(key,value){const iv=crypto.getRandomValues(new Uint8Array(12));return {iv,data:await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(value)))};}
async function decrypt(key,value){return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:value.iv},key,value.data)));}
export class Vault{
 async open(email,password,allowCreate=false){
  if(!navigator.locks)throw Error('This browser needs an update for safe offline storage. Use a current Chrome, Edge, Safari or Firefox.');
  this.email=email.toLowerCase();
  return navigator.locks.request('wellness-restaurant-vault-'+this.email,async()=>{
   const record=await read(this.email);this.salt=record?.salt||crypto.getRandomValues(new Uint8Array(16));this.key=await derive(password,this.salt);
   if(record){try{this.state=await decrypt(this.key,record);}catch{this.key=null;throw Error('Saved offline data uses another password. Unlock it with the previous password first. No saved entries were removed.');}}
   else {if(!allowCreate){this.key=null;throw Error('Sign in online and prepare this phone before using it offline.');}this.state={user:null,deviceId:crypto.randomUUID(),device:null,sequence:0,queue:[],events:[],assignments:[],members:[],snapshots:{},preparedUntil:0};await write(this.email,{salt:this.salt,...await encrypt(this.key,this.state)});}
   return this.state;
  });
 }
 async edit(fn){if(!this.key)throw Error('Unlock this phone first.');return navigator.locks.request('wellness-restaurant-vault-'+this.email,async()=>{const data=await decrypt(this.key,await read(this.email));const result=fn(data);await write(this.email,{salt:this.salt,...await encrypt(this.key,data)});this.state=data;return result;});}
 async reload(){this.state=await decrypt(this.key,await read(this.email));return this.state;}
 async rekey(password){await navigator.locks.request('wellness-restaurant-vault-'+this.email,async()=>{const state=await decrypt(this.key,await read(this.email));const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(password,salt);await write(this.email,{salt,...await encrypt(key,state)});this.salt=salt;this.key=key;this.state=state;});}
 close(){this.key=null;this.state=null;}
}
