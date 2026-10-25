import assert from 'node:assert/strict';
import {resolveContext} from '../navigation.js';
const missions=[{id:'training'},{id:'march'},{id:'april'},{id:'empty'}];
const events=[
 {id:'sample',mission_id:'training',sample:true,starts:'2027-03-22',location:'Training'},
 {id:'day1',mission_id:'march',starts:'2027-03-22',location:'Village A'},
 {id:'day2',mission_id:'march',starts:'2027-03-23',location:'Village A'},
 {id:'venue2',mission_id:'march',starts:'2027-03-22',location:'Village B'},
 {id:'april1',mission_id:'april',starts:'2027-04-01',location:'Village A'}
];
const state={missions,events};const today='2027-03-22';
assert.deepEqual(resolveContext(state,{},today),{missionID:'march',eventID:'day1'});
assert.deepEqual(resolveContext(state,{missionID:'march',eventID:'day2'},today),{missionID:'march',eventID:'day2'},'Keep tomorrow when explicitly selected');
assert.equal(resolveContext(state,{missionID:'april',eventID:'day1'},today).eventID,'april1','Never carry a day into another mission');
assert.equal(resolveContext(state,{missionID:'empty',eventID:'day1'},today).eventID,'','Empty mission cannot display another mission’s data');
assert.equal(resolveContext(state,{eventID:'venue2'},today).eventID,'venue2','Same date, separate locations');
assert.equal(resolveContext(state,{missionID:'removed',eventID:'removed'},today).eventID,'day1','Recover when access was removed');
assert.deepEqual(resolveContext({},undefined,today),{missionID:'',eventID:''});
assert.equal(resolveContext(state,{missionID:'march',eventID:'day1'},'2027-03-24').eventID,'day1','Browsing past dates keeps the chosen day');
assert.equal(resolveContext(state,{missionID:'march'},'2027-03-24').eventID,'day2','Prefer most recent past date when no selection exists');
console.log('PASS: mission/day isolation, saved choices, same-venue dates, same-date venues, empty missions and revoked access');
