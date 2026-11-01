const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Globally assign detections to enrolled targets so one hand cannot steal
// another target's closest match. No landmarks are fabricated during loss.
export function matchHands(targets,candidates,pose,now) {
  const costs=targets.map(target=>candidates.map(hand=>{
    const age=now-(target.lastSeen ?? now);
    const dt=Math.min(age/1000,0.18);
    const predicted={x:target.x+(target.vx||0)*dt,y:target.y+(target.vy||0)*dt};
    const d=distance(predicted,hand);
    const wrist=pose[target.poseIndex];
    const anchor=wrist && (wrist.visibility ?? 0)>=0.55 ? distance(wrist,hand) : Infinity;
    const gate=0.22+Math.min(.16,Math.hypot(target.vx||0,target.vy||0)*dt*.5);
    if (age>750 ? anchor>.14 : d>gate && anchor>.14) return Infinity;
    if (hand.side!==target.side && d>.10 && anchor>.12) return Infinity;
    return Math.min(d,anchor+.04)+(hand.side===target.side ? 0 : .08);
  }));
  let best={cost:Infinity,indices:[]};
  function visit(i,used,indices,cost) {
    if(i===targets.length){if(cost<best.cost)best={cost,indices:[...indices]};return;}
    visit(i+1,used,[...indices,-1],cost+.65);
    candidates.forEach((_,j)=>{if(!used.has(j)&&Number.isFinite(costs[i][j])){
      used.add(j);visit(i+1,used,[...indices,j],cost+costs[i][j]);used.delete(j);
    }});
  }
  visit(0,new Set(),[],0);
  return best.indices.flatMap((index,i)=>{
    if(index<0)return [];
    const target=targets[i], hand=candidates[index];
    const dt=Math.max(.016,(now-(target.lastSeen ?? now))/1000);
    const clamp=v=>Math.max(-4,Math.min(4,v));
    target.vx=dt<.3 ? clamp((hand.x-target.x)/dt) : 0;
    target.vy=dt<.3 ? clamp((hand.y-target.y)/dt) : 0;
    target.x=hand.x;target.y=hand.y;target.lastSeen=now;
    return [{...hand,side:target.side,trackId:target.id}];
  });
}
