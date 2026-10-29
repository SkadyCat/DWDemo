import test from 'node:test';
import assert from 'node:assert/strict';
import {questTrackerView} from '../public/quests/tracker-view.mjs';
const quest={id:'first_floor',name:'初入高塔',objective:'通关第 1 层',floor:1,stage:'active'};
test('quest tracker reflects actual waves on the target floor without completing the boss',()=>{
 const view=questTrackerView({quest,floor:1,phase:'waves',wavesCompleted:2});assert.equal(view.waves,2);assert.equal(view.bossDone,false);assert.equal(view.reward,false);
 const other=questTrackerView({quest,floor:2,phase:'boss',wavesCompleted:3});assert.equal(other.waves,0);assert.match(other.hint,/第 1 层/);
});
test('quest tracker only advertises claim after the quest model marks its reward ready',()=>{
 const boss=questTrackerView({quest,floor:1,phase:'boss',wavesCompleted:3});assert.equal(boss.waves,3);assert.equal(boss.bossDone,false);
 const reward=questTrackerView({quest:{...quest,stage:'reward'},floor:2,phase:'waves'});assert.equal(reward.bossDone,true);assert.equal(reward.stage,'可领取');
 const empty=questTrackerView({quest:null});assert.equal(empty.empty,true);
});

test('quest tracker shows room exploration and the boss objective without requiring waves',()=>{
 const view=questTrackerView({quest,floor:1,phase:'boss',completionMode:'boss',visitedRooms:4,totalRooms:12});
 assert.equal(view.waveLabel,'探索随机地牢');assert.equal(view.countLabel,'4 / 12');assert.equal(view.bossDone,false);assert.match(view.hint,/传送阵/);
});
