/* 입금 처리 공용 (홈, 장부 둘 다 사용) */
(function(){
function money(t){
  const m=String(t).match(/(\d[\d,]*(?:\.\d+)?)\s*(?:(만)\s*(?:(\d+)\s*천)?|(천))?\s*(원)?/);
  if(!m||!m[0].trim()) return null;
  let n=parseFloat(m[1].replace(/,/g,''));
  if(m[2]) n=n*10000+(m[3]?+m[3]*1000:0); else if(m[4]) n=n*1000;
  return {n:Math.round(n), s:m[0]};
}
/* "김똘똘 35000", "김똘똘 3만5천 입금", "어제 김똘똘님 35000원 들어옴" */
function parsePayment(line, ymd){
  let t=' '+line.trim()+' ';
  const now=new Date(); let d=new Date(now);
  if(/그저께|그제/.test(t)){ d.setDate(d.getDate()-2); t=t.replace(/그저께|그제/,' '); }
  else if(/어제/.test(t)){ d.setDate(d.getDate()-1); t=t.replace(/어제/,' '); }
  else if(/오늘/.test(t)){ t=t.replace(/오늘/,' '); }
  const dm=t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)||t.match(/(?<![\d.])(\d{1,2})\/(\d{1,2})(?![\d])/);
  if(dm){ d=new Date(now.getFullYear(),+dm[1]-1,+dm[2]); t=t.replace(dm[0],' '); }
  const m=money(t); if(m) t=t.replace(m.s,' ');
  const name=t.replace(/(입금됨|입금완료|입금|들어옴|들어왔음|받음|님|으로|로|에서|원|,)/g,' ').replace(/\s+/g,' ').trim();
  return {date:ymd(d), name, amount:m?m.n:null};
}
/* 저장된 건물주 이름이 있거나 "입금"이라고 쓴 줄 */
function looksLikePayment(line, owners){
  const t=line.trim();
  if(/입금|들어옴|들어왔/.test(t) && money(t)) return true;
  return owners.some(o=>o && t.startsWith(o)) && !!money(t);
}
/* 미수 기록 중에서 입금액에 딱 맞는 걸 찾기 (오래된 것부터) */
function matchPayment(amount, recs){
  if(!amount) return [];
  const rs=recs.filter(r=>!r.paid && Number(r.charge)>0)
    .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.createdAt||0)-(b.createdAt||0)).slice(0,14);
  const one=rs.find(r=>Number(r.charge)===amount); if(one) return [one];
  let acc=0; for(let i=0;i<rs.length;i++){ acc+=Number(rs[i].charge); if(acc===amount) return rs.slice(0,i+1); if(acc>amount) break; }
  let best=null;
  for(let mask=1; mask<(1<<rs.length); mask++){
    let s=0, pick=[];
    for(let i=0;i<rs.length;i++) if(mask&(1<<i)){ s+=Number(rs[i].charge); pick.push(rs[i]); if(s>amount) break; }
    if(s===amount && (!best || pick.length<best.length)) best=pick;
  }
  return best||[];
}
Object.assign(window,{parsePayment, looksLikePayment, matchPayment});
})();
