/* 재고 계산 공용 (홈, 장부 둘 다 사용) */
(function(){
const VA = [['전진철물점','전진철물점'],['전진철물','전진철물점'],['전진','전진철물점'],
  ['장땡타일','장땡타일'],['장원산업','장땡타일'],['장땡','장땡타일'],
  ['라온조명','라온조명'],['라온전기','라온조명'],['라온','라온조명'],
  ['쿠팡','인터넷'],['인터넷','인터넷']].sort((a,b)=>b[0].length-a[0].length);
const ikey = s => String(s||'').replace(/\s/g,'').toLowerCase();
const asc = (a,b)=>(a.date||'').localeCompare(b.date||'')||(a.createdAt||0)-(b.createdAt||0);

function findVendor(text){ for(const [a,v] of VA) if(String(text).includes(a)) return {alias:a, vendor:v}; return null; }

function findPart(text, names){
  const k=ikey(text); let best='';
  for(const n of names){ const nk=ikey(n); if(nk.length>=1 && k.includes(nk) && nk.length>ikey(best).length) best=n; }
  return best;
}

/* 구매(purchases) + 사용(ledger의 part) → 품목별 재고. 먼저 산 것부터 꺼내 씀 */
function buildStock(purchases, ledger){
  const parts={};
  const P=(k,name)=>parts[k]||(parts[k]={key:k,name,lots:[],uses:[],discards:[],bought:0,used:0,short:0});
  purchases.slice().sort(asc).forEach(p=>{
    const k=ikey(p.item); if(!k || !(p.qty>0)) return;
    const e=P(k,p.item);
    e.lots.push({id:p.id, vendor:p.vendor||'기타', date:p.date, qty:p.qty, price:p.unitPrice, left:p.qty, p});
    e.bought+=p.qty;
  });
  const cons=[
    ...ledger.filter(r=>r.part).map(r=>({type:'use',date:r.date,createdAt:r.createdAt,k:ikey(r.part),vendor:r.vendor,qty:r.partQty||1,r})),
    ...purchases.filter(p=>p.qty<0).map(p=>({type:'discard',date:p.date,createdAt:p.createdAt,k:ikey(p.item),vendor:p.vendor,qty:-p.qty,p}))
  ].sort(asc);
  cons.forEach(c=>{
    const e=parts[c.k]; if(!e) return;
    let need=c.qty; const from=[];
    const take=pool=>{ for(const l of pool){ if(need<=0) break; const t=Math.min(l.left,need); if(t<=0) continue; l.left-=t; need-=t; from.push({lot:l,qty:t}); } };
    take(e.lots.filter(l=>!c.vendor||l.vendor===c.vendor));
    if(need>0) take(e.lots);
    e.used+=c.qty; e.short+=need;
    (c.type==='use'?e.uses:e.discards).push({...c,from,short:need});
  });
  Object.values(parts).forEach(e=>{
    e.left=e.lots.reduce((a,l)=>a+l.left,0);
    e.byVendor={};
    e.lots.forEach(l=>{
      const v=e.byVendor[l.vendor]||(e.byVendor[l.vendor]={left:0,bought:0,lastPrice:null,lastDate:''});
      v.left+=l.left; v.bought+=l.qty;
      if((l.date||'')>=v.lastDate){ v.lastDate=l.date||''; v.lastPrice=l.price; }
    });
    const last=e.lots.slice().sort(asc).pop(); e.lastPrice=last?.price; e.lastDate=last?.date;
  });
  return parts;
}

/* 수리 기록 1건의 원가: 재고에서 꺼낸 물건 값 (재고 없이 쓴 건 0원), 재고 안 쓴 기록은 적어둔 매입가 */
function effCost(stock, r){
  if(!r.part) return Number(r.cost)||0;
  const e=stock[ikey(r.part)]; if(!e) return 0;
  const u=e.uses.find(x=>x.r===r || (r.id && x.r.id===r.id));
  return u ? u.from.reduce((a,f)=>a+f.lot.price*f.qty,0) : 0;
}
const effMargin=(stock,r)=>(Number(r.charge)||0)-effCost(stock,r);

/* 지금 쓰면 어느 가게 것, 얼마짜리가 나가는지 */
function suggest(stock, part, vendor){
  const e=stock[ikey(part)]; if(!e) return null;
  const lot=e.lots.find(l=>l.left>0&&(!vendor||l.vendor===vendor)) || e.lots.find(l=>l.left>0);
  if(lot) return {vendor:lot.vendor, price:lot.price, inStock:true};
  const last=e.lots.slice().sort(asc).pop();
  return last ? {vendor:last.vendor, price:last.price, inStock:false} : null;
}

/* 메모 한 줄 → 구매 기록 ("전진 수전 3개 12000") */
function parsePurchase(line, ymd){
  const src=line.trim(); let t=' '+src+' ';
  const now=new Date(); let d=new Date(now);
  if(/그저께|그제/.test(t)){ d.setDate(d.getDate()-2); t=t.replace(/그저께|그제/,' '); }
  else if(/어제/.test(t)){ d.setDate(d.getDate()-1); t=t.replace(/어제/,' '); }
  else if(/오늘/.test(t)){ t=t.replace(/오늘/,' '); }
  const dm=t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)||t.match(/(?<![\d.])(\d{1,2})\/(\d{1,2})(?![\d])/);
  if(dm){ d=new Date(now.getFullYear(),+dm[1]-1,+dm[2]); t=t.replace(dm[0],' '); }
  const fv=findVendor(t); const vendor=fv?fv.vendor:'기타'; if(fv) t=t.replace(fv.alias,' ');
  let qty=1; const qm=t.match(/(\d+)\s*(개|ea|EA|장|롤|박스|통|세트|미터)/);
  if(qm){ qty=+qm[1]; t=t.replace(qm[0],' '); }
  let n=null; const am=t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:(만)\s*(?:(\d+)\s*천)?|(천))?\s*(원)?/);
  if(am && am[0].trim()){
    n=parseFloat(am[1].replace(/,/g,''));
    if(am[2]) n=n*10000+(am[3]?+am[3]*1000:0); else if(am[4]) n=n*1000;
    t=t.replace(am[0],' ');
  }
  const isTotal=/총|합계|전부|다해서|합쳐/.test(src);
  const unitPrice = n==null ? null : Math.round(isTotal ? n/qty : n);
  const item=t.replace(/(개당|하나에|한개에|낱개|총액|총|합계|전부|다해서|합쳐서|구입함|구입|구매|사옴|샀음|샀다|샀|삼|원|에서|에|@|,)/g,' ').replace(/\s+/g,' ').trim();
  return {date:ymd(d), vendor, item, qty, unitPrice, total: unitPrice==null?null:unitPrice*qty};
}
const looksLikePurchase = line => !!findVendor(line) || /(샀|구입|구매|사옴)/.test(line);

Object.assign(window,{effCost, effMargin, VENDOR_ALIASES:VA, ikey, findVendor, findPart, buildStock, suggest, parsePurchase, looksLikePurchase});
})();
