import {createRequire} from 'node:module';
const require=createRequire("/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/package.json");
const {default:react}=await import(require.resolve('@vitejs/plugin-react'));
export default {root:"/tmp/vibyra-agent-audit-20260904/ui",plugins:[react()],resolve:{alias:{react:require.resolve('react/package.json').replace('/package.json',''), 'react-dom':require.resolve('react-dom/package.json').replace('/package.json','')}},server:{host:'127.0.0.1',port:18747,strictPort:true,fs:{allow:["/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri","/tmp/vibyra-agent-audit-20260904/ui"]}}};
