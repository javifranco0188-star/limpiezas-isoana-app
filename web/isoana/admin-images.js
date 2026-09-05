import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(
  'https://modwyqxponjcmldxpbqv.supabase.co',
  'sb_publishable_0HKdOCZMiFI6WlKYvQqdtw_4Uq4GE0c'
);

const BUCKET = 'isoana-images';
let serviceImages = new Map();
let heroUrl = '';
let injecting = false;

const slug = s => String(s || 'imagen').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);

function validFile(file){
  if(!file) return 'Selecciona una imagen.';
  if(!['image/jpeg','image/png'].includes(file.type)) return 'Solo se permiten imágenes JPG, JPEG o PNG.';
  if(file.size > 10 * 1024 * 1024) return 'La imagen no puede superar 10 MB.';
  return '';
}

async function isAdmin(){
  const {data:{session}} = await sb.auth.getSession();
  if(!session) return false;
  const {data} = await sb.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
  return data?.role === 'admin';
}

async function refreshImageData(){
  const [sv, st] = await Promise.all([
    sb.from('services').select('id,name,image_url'),
    sb.from('app_settings').select('value').eq('id','hero_image_url').maybeSingle()
  ]);
  serviceImages = new Map((sv.data || []).map(x => [x.name, x.image_url || '']));
  heroUrl = st.data?.value || '';
  applyImages();
}

function applyImages(){
  if(heroUrl){
    const hero = document.querySelector('.hero');
    if(hero) hero.style.backgroundImage = `url("${heroUrl}")`;
  }
  document.querySelectorAll('.card').forEach(card => {
    const name = card.querySelector('.name')?.textContent?.trim();
    const img = card.querySelector('img');
    const url = serviceImages.get(name);
    if(img && url) img.src = url;
  });
}

async function uploadFile(file, folder, baseName){
  const err = validFile(file);
  if(err) throw new Error(err);
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${folder}/${slug(baseName)}-${Date.now()}.${ext}`;
  const {error} = await sb.storage.from(BUCKET).upload(path, file, {cacheControl:'3600', upsert:false, contentType:file.type});
  if(error) throw error;
  const {data} = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function saveHero(file, btn){
  btn.disabled = true; btn.textContent = 'SUBIENDO...';
  try{
    const url = await uploadFile(file,'cabecera','cabecera');
    const {error} = await sb.from('app_settings').upsert({id:'hero_image_url',value:url,updated_at:new Date().toISOString()});
    if(error) throw error;
    heroUrl = url; applyImages();
    alert('Imagen de cabecera actualizada correctamente.');
  }catch(e){ alert('No se pudo guardar la imagen: ' + e.message); }
  finally{ btn.disabled = false; btn.textContent = 'CAMBIAR CABECERA'; }
}

async function saveServiceImage(service, file, btn){
  btn.disabled = true; btn.textContent = 'SUBIENDO...';
  try{
    const url = await uploadFile(file,'servicios',service.name);
    const {error} = await sb.from('services').update({image_url:url}).eq('id',service.id);
    if(error) throw error;
    serviceImages.set(service.name,url); applyImages();
    alert('Imagen de servicio actualizada correctamente.');
  }catch(e){ alert('No se pudo guardar la imagen: ' + e.message); }
  finally{ btn.disabled = false; btn.textContent = 'CAMBIAR IMAGEN'; }
}

async function injectAdminControls(){
  if(injecting) return;
  const admin = document.getElementById('adminContent');
  if(!admin || admin.closest('.hide')) return;
  if(!(await isAdmin())) return;
  injecting = true;
  try{
    if(!admin.querySelector('[data-image-admin="hero"]')){
      const box = document.createElement('div');
      box.className = 'item';
      box.dataset.imageAdmin = 'hero';
      box.innerHTML = `<b>Imagen de cabecera</b><div class="small" style="margin:6px 0">Carga una imagen JPG, JPEG o PNG desde tu móvil.</div><input class="field" type="file" accept="image/jpeg,image/png"><button class="btn blue">CAMBIAR CABECERA</button>`;
      const input = box.querySelector('input');
      const btn = box.querySelector('button');
      btn.addEventListener('click',()=>saveHero(input.files?.[0],btn));
      admin.prepend(box);
    }

    const {data:services} = await sb.from('services').select('id,name').order('name');
    const byName = new Map((services || []).map(s=>[s.name,s]));
    admin.querySelectorAll('.item').forEach(item=>{
      if(item.dataset.imageAdmin) return;
      const name = item.querySelector('b')?.textContent?.trim();
      const svc = byName.get(name);
      if(!svc || item.querySelector('[data-service-image]')) return;
      const wrap = document.createElement('div');
      wrap.dataset.serviceImage = '1';
      wrap.style.marginTop = '10px';
      wrap.innerHTML = `<div class="small" style="margin-bottom:5px">Imagen del servicio (JPG, JPEG o PNG)</div><input class="field" type="file" accept="image/jpeg,image/png"><button class="btn blue">CAMBIAR IMAGEN</button>`;
      const input = wrap.querySelector('input');
      const btn = wrap.querySelector('button');
      btn.addEventListener('click',()=>saveServiceImage(svc,input.files?.[0],btn));
      item.appendChild(wrap);
    });
  } finally { injecting = false; }
}

const observer = new MutationObserver(()=>{ applyImages(); injectAdminControls(); });
observer.observe(document.documentElement,{subtree:true,childList:true});

sb.auth.onAuthStateChange(()=>setTimeout(injectAdminControls,150));
window.addEventListener('load', async()=>{ await refreshImageData(); setTimeout(injectAdminControls,300); });
setInterval(applyImages,1500);
