// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {PasswordRecoveryScreen} from '../src/components/PasswordRecoveryScreen';
afterEach(cleanup);
it('keeps mismatching passwords local and permits correction',async()=>{
  const update=vi.fn(async()=>{});
  render(<PasswordRecoveryScreen onUpdatePassword={update}/>);
  fireEvent.change(screen.getByLabelText('كلمة المرور الجديدة'),{target:{value:'a sufficiently long password'}});
  fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور الجديدة'),{target:{value:'a different long password'}});
  fireEvent.click(screen.getByRole('button',{name:'تأكيد كلمة المرور الجديدة'}));
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('غير متطابقتين');
  fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور الجديدة'),{target:{value:'a sufficiently long password'}});
  fireEvent.click(screen.getByRole('button',{name:'تأكيد كلمة المرور الجديدة'}));
  await waitFor(()=>expect(update).toHaveBeenCalledWith('a sufficiently long password'));
});
it('offers only session completion after the password has already changed',async()=>{
  const update=vi.fn(async()=>{});
  render(<PasswordRecoveryScreen passwordUpdated onUpdatePassword={update}/>);
  expect(screen.queryByLabelText('كلمة المرور الجديدة')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'إنهاء الجلسات والعودة للدخول'}));
  await waitFor(()=>expect(update).toHaveBeenCalledWith(''));
});
