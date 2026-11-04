import { describe, expect, it } from 'vitest';
import { activeFormQuestionCount, formDateLabel, formStatusLabel } from '../../src/lib/registration/registrationFormList';
describe('registration form list metadata',()=>{
 it('counts only active questions and sections',()=>expect(activeFormQuestionCount({sections:[{fields:[{id:'a'},{id:'b',isActive:false}]},{isActive:false,fields:[{id:'c'}]}]})).toBe(1));
 it('does not invent missing question counts or dates',()=>{expect(activeFormQuestionCount({})).toBeNull();expect(formDateLabel({})).toBeNull();});
 it('shows the saved lifecycle consistently',()=>{expect(formStatusLabel({rawStatus:'archived',status:'Closed'})).toBe('Archived');expect(formStatusLabel({rawStatus:'active'})).toBe('Open');expect(formStatusLabel({status:'unknown'})).toBe('Status unavailable');});
 it('handles backend and SDK timestamps',()=>{expect(formDateLabel({updatedAt:{seconds:1782864000}})).toContain('Updated');expect(formDateLabel({createdAt:'invalid'})).toBeNull();});
});
