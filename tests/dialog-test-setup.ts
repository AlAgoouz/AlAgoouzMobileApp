// jsdom has no native top-layer dialog implementation. Real focus isolation,
// viewport fit and Escape behavior are verified separately in browser CI.
if(typeof HTMLDialogElement!=='undefined'){
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
}
