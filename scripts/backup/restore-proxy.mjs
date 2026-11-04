// A separate event loop keeps the isolated loopback proxy responsive while
// the parent executes synchronous pg_restore/psql processes. No public listener.
import net from 'node:net';
import {parentPort,workerData} from 'node:worker_threads';
const {host,port}=workerData;
if(!/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)||![5432,5000,9999].includes(port))throw Error('RESTORE_PROXY_TARGET_REFUSED');
const server=net.createServer(client=>{
 const target=net.createConnection({host,port});
 client.on('error',()=>target.destroy());target.on('error',()=>client.destroy());
 client.on('close',()=>target.destroy());target.on('close',()=>client.destroy());
 client.pipe(target);target.pipe(client);
});
server.on('error',()=>{throw Error('RESTORE_PROXY_UNAVAILABLE');});
server.listen(0,'127.0.0.1',()=>parentPort.postMessage({port:server.address().port}));
