import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import Control from '../../src/components/crm/live-scores/LiveScoreControl.svelte';
it('team taps expand and fold; points target the selected player or team', async () => {
 const onScore=vi.fn();
 render(Control,{board:{id:'game',tenantId:'tenant',title:'Mission',names:['Sharks','Lions'],scores:[3,0],status:'live',display:'duel',revision:1,started:true,players:[[{id:'alex',name:'Alex',points:3}],[]]},onScore,onAction:vi.fn(),onEdit:vi.fn()});
 const team=screen.getByRole('button',{name:'Select Sharks'});
 expect(screen.queryByText('Alex')).toBeNull();await fireEvent.click(team);
 await fireEvent.click(screen.getByRole('button',{name:'Alex 3'}));
 await fireEvent.click(screen.getByRole('button',{name:'Add 3 points'}));expect(onScore).toHaveBeenLastCalledWith(0,3,'alex');
 await fireEvent.click(team);expect(screen.queryByText('Alex')).toBeNull();
 await fireEvent.click(screen.getByRole('button',{name:'Add 1 point'}));expect(onScore).toHaveBeenLastCalledWith(0,1,undefined);
 expect(screen.queryByText('Team & player scoring')).toBeNull();expect(screen.queryByText('Update player highlights')).toBeNull();
});
