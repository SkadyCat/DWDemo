// VM parity cases for the four data-authored summons. Movement and character
// triggers are tested in trigger-summons.test.mjs; these isolate shared rule VM behavior.
export const triggerSummonScenarios=['iron_guard','ember_hound','fire_turret','storm_totem'].flatMap(id=>[false,true].map(overrides=>({
 id:`summon_${id}_${overrides?'override_cap':'default'}`,commit:true,frames:660,dt:1/60,
 plans:[{key:'p',build:id,...(overrides?{params:{['summon_'+id]:{duration:2,interval:.5,range:6,cap:2},[({iron_guard:'iron_guard_slash',ember_hound:'ember_hound_bite',fire_turret:'fire_turret_fireball',storm_totem:'storm_totem_lightning'})[id]]:{damage:37}}}:{})}],
 owners:[{key:'hero',externalId:1,team:0,position:[0,0,0],aim:[1,0,0]}],
 targets:[{id:710,position:[.8,0,0],radius:.2,health:100000,team:1},{id:711,position:[.8,1.2,0],radius:.2,health:100000,team:1},{id:712,position:[20,0,0],radius:.2,health:100000,team:1}],
 casts:(overrides?[0,6,12,18]:[0]).map((frame,i)=>({frame,plan:'p',owner:'hero',origin:[0,0,0],direction:[1,0,0],seed:701+i,power:0})),statusQuery:['shock'],
})));
