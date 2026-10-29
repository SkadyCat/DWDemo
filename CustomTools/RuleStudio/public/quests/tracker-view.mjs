// Presentation only: never completes quests or creates rewards.
export function questTrackerView({quest,floor,phase,wavesCompleted=0,completionMode,visitedRooms=0,totalRooms=0}){
 if(!quest)return {empty:true,title:'暂无追踪任务',stage:'空闲',objective:'',waves:0,waveLabel:'',bossDone:false,hint:'按 J 查看任务',reward:false};
 const reward=quest.stage==='reward',sameFloor=floor===quest.floor;
 if(completionMode==='boss')return {empty:false,title:quest.name,stage:reward?'可领取':phase==='failed'&&sameFloor?'待重试':'进行中',objective:quest.objective,waves:reward?3:Math.min(3,Math.floor(3*visitedRooms/Math.max(1,totalRooms))),waveLabel:'探索随机地牢',countLabel:`${visitedRooms} / ${totalRooms}`,bossDone:reward,reward,hint:reward?'已完成 · 三把武器选一把':!sameFloor?`前往第 ${quest.floor} 层完成试炼`:phase==='failed'?'挑战失败 · 可以重新挑战':'击败守卫 → 开启传送阵'};
 const waves=reward?3:sameFloor?Math.max(0,Math.min(3,Math.trunc(wavesCompleted)||0)):0;
 return {empty:false,title:quest.name,stage:reward?'可领取':phase==='failed'&&sameFloor?'待重试':'进行中',objective:quest.objective,waves,waveLabel:'清理三波怪潮',bossDone:reward,reward,
  hint:reward?'已完成 · 三把武器选一把':!sameFloor?`前往第 ${quest.floor} 层完成试炼`:phase==='failed'?'挑战失败 · 可以重新挑战':phase==='boss'?'怪潮已清理 · 击败守卫':'三选一 · 随机武器奖励'};
}
