/* 할 일(일정) 공용: 날짜·시간 읽기, 할 일 문장 판단 */
(function(){
const pad=n=>String(n).padStart(2,'0');
const ymdL=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const DAYS='일월화수목금토';
/* "내일 오후2시", "10/2", "10월 3일 9시반", "금요일" → {date, time, rest} */
function parseWhen(text){
  let t=' '+String(text||'')+' ', date='', time='';
  const now=new Date(); now.setHours(0,0,0,0);
  const add=n=>{ const d=new Date(now); d.setDate(d.getDate()+n); return ymdL(d); };
  let m;
  if((m=t.match(/오늘/))){ date=add(0); }
  else if((m=t.match(/내일/))){ date=add(1); }
  else if((m=t.match(/모레/))){ date=add(2); }
  else if((m=t.match(/글피/))){ date=add(3); }
  else if((m=t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)) || (m=t.match(/(?<![\d.])(\d{1,2})\/(\d{1,2})(?![\d])/))){
    let d=new Date(now.getFullYear(), +m[1]-1, +m[2]);
    if(d < new Date(now.getFullYear(), now.getMonth()-2, 1)) d.setFullYear(d.getFullYear()+1);
    date=ymdL(d);
  }
  else if((m=t.match(/(다음\s*주\s*)?([일월화수목금토])요일/))){
    const target=DAYS.indexOf(m[2]); let diff=(target-now.getDay()+7)%7; if(diff===0) diff=7; if(m[1]) diff+= diff<7?7:0;
    date=add(diff);
  }
  if(m) t=t.replace(m[0],' ');
  let tm=t.match(/(오전|오후|아침|저녁|밤)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/) || t.match(/(오전|오후)?\s*(\d{1,2}):(\d{2})/);
  if(tm){
    let h=+tm[2]; const mi=tm[3]?+tm[3]:(tm[4]?30:0);
    if(/오후|저녁|밤/.test(tm[1]||'') && h<12) h+=12;
    if(!tm[1] && h>=1 && h<=7) h+=12;          // "2시" 는 보통 오후
    if(h<24){ time=`${pad(h)}:${pad(mi)}`; t=t.replace(tm[0],' '); }
  }
  return {date, time, rest:t.replace(/\s+/g,' ').trim()};
}
const TASK_RE=/(필요|해야|사야|사와|해줘|예정|접수|봐야|봐줘|점검|요청|방문|할것|할 것|확인해|고쳐야|갈아야|교체해야|문의|연락|약속|가야|가볼|보러)/;
/* 돈 얘기가 있는지 (호수 숫자, 날짜, 시간은 빼고) */
function hasMoney(text){
  const t=String(text).replace(/\d+\s*호/g,' ').replace(/\d{1,2}\s*\/\s*\d{1,2}/g,' ').replace(/\d{1,2}\s*(시|분|월|일|층|개)/g,' ').replace(/\d{1,2}:\d{2}/g,' ');
  return /\d[\d,]*\s*(만|천|원)/.test(t) || /\d{4,}/.test(t.replace(/,/g,''));
}
const whenLabel=(date,time)=>{
  if(!date && !time) return '';
  const today=ymdL(new Date()); const tm=new Date(); tm.setDate(tm.getDate()+1);
  let d = date===today?'오늘':(date===ymdL(tm)?'내일':(date?`${+date.slice(5,7)}/${+date.slice(8,10)}(${DAYS[new Date(date+'T00:00').getDay()]})`:''));
  if(time){ const h=+time.slice(0,2), mi=time.slice(3); d+=(d?' ':'')+(h<12?'오전 ':'오후 ')+((h%12)||12)+'시'+(mi!=='00'?' '+mi+'분':''); }
  return d;
};
Object.assign(window,{parseWhen, TASK_RE, hasMoney, whenLabel});
})();
