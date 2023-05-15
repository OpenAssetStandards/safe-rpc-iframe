# safe-rpc-iframe

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![Codecov][codecov-src]][codecov-href]
[![License][license-src]][license-href]
[![JSDocs][jsdocs-src]][jsdocs-href]

### Safe and easy cross-domain iframe communication
Fully encrypted & authenticated communication between an iframe and a parent window using [safe-rpc](https://github.com/OpenAssetStandards/safe-rpc).


## 🚀 Quick Start

Install:

```bash
# npm
npm i safe-rpc safe-rpc-iframe

# yarn
yarn add safe-rpc safe-rpc-iframe
```

## Usage
### 1. First define the RPC interfaces that your parent and child iframes will expose
Note: You can skip this if you are not using TypeScript
```typescript
interface IParentFrameRPCInterface {
  stringLength(str: string): Promise<number>;
  // note that you can only pass in one parameter.
  // so if you need to send multiple parameters, put it in an array or an object like the line below
  splitString(params: {str: string, delimiter: string}): Promise<string[]>;
}
interface IChildFrameRPCInterface {
  sumNumbers(numbers: number[]): Promise<number>;
  reverseArray(arr: any[]): Promise<any[]>;
}
```

### 2. Next implement the child frame's code
```typescript
interface IParentFrameRPCInterface {
  stringLength(str: string): Promise<number>;
  // note that you can only pass in one parameter.
  // so if you need to send multiple parameters, put it in an array or an object like the line below
  splitString(params: {str: string, delimiter: string}): Promise<string[]>;
}
interface IChildFrameRPCInterface {
  sumNumbers(numbers: number[]): Promise<number>;
  reverseArray(arr: any[]): Promise<any[]>;
  setName(name: string): Promise<void>;
  getName(): Promise<string>;
}


abstract class InternalLogic {
  peer: IParentFrameRPCInterface;
  name: string = "";
  constructor(peer: IParentFrameRPCInterface){
    this.peer = peer;
  }
  // this function will NOT be exposed over RPC
  // only functions implemented in the class instance passed to registerHandlerClass will be exposed
  // the functions in classes inherited by the instance will NOT be exposed via RPC
  hidden(){
    return "i am hidden";
  }
}
class ChildRPCHandlerClass extends InternalLogic implements IChildFrameRPCInterface{
  constructor(peer: IParentFrameRPCInterface){
    super(peer);
  }
  // this function will be exposed over RPC
  async sumNumbers({numbers}: { numbers: number[]; }): Promise<number> {
    return numbers.reduce((a,b)=>a+b,0)+splitTest;
  }

  // this function will be exposed over RPC
  async reverseArray(arr: any[]): Promise<any[]> {
    // you can call a function exposed by the parent frame inside an RPC function
    const splitTest = await this.peer.stringLength({str:"test string"});
    console.log("splitTest: ",splitTest);
    return arr.concat([]).reverse();
  }
  async setName(name: string): Promise<void> {
    this.name = name;
  }
  async getName(): Promise<string> {
    if(!this.name){
      throw new Error("my name has not yet been set");
    }
    return this.name;
  }
}

// boilerplate initialization code
async function demoChild(){
  // create an RPC session using the information in the "#" of the URL
  const rpcSession = await createChildIFrameRPCSession();

  // expose class ChildRPCHandlerClass to a parent which exposes an RPC interface 'IParentFrameRPCInterface'
  const handler = rpcSession.registerHandlerClass<ChildRPCHandlerClass, IParentFrameRPCInterface>(
    (peer)=>new ChildRPCHandlerClass(peer)
  );
}
demoChild()
  .then(()=>{
    console.log("[child] RPC API listening for calls")
  })
  .catch(err=>{
    console.error("[child] Error starting RPC API listener: ",err);
  });
```
### 3. Now build your child iframe and upload to your favorite static web host (For example, AWS S3)
For this tutorial, we will assume that the iframe was uploaded to https://example.com/iframe.html

### 4. Now implement the parent window's code
```typescript
interface IParentFrameRPCInterface {
  stringLength(str: string): Promise<number>;
  // note that you can only pass in one parameter.
  // so if you need to send multiple parameters, put it in an array or an object like the line below
  splitString(params: {str: string, delimiter: string}): Promise<string[]>;
}
interface IChildFrameRPCInterface {
  sumNumbers(numbers: number[]): Promise<number>;
  reverseArray(arr: any[]): Promise<any[]>;
  setName(name: string): Promise<void>;
  getName(): Promise<string>;
}

abstract class InternalLogic {
  peer: IChildFrameRPCInterface;
  rpcSession: EncryptedRPCSession;
  constructor(peer: IChildFrameRPCInterface, rpcSession: EncryptedRPCSession){
    this.peer = peer;
    this.rpcSession = rpcSession;
  }
  hidden(){
    return "i am hidden (parent)";
  }
  dispose(){
    this.rpcSession.dispose();
  }
}
class ParentRPCHandlerClass extends InternalLogic implements IParentFrameRPCInterface{
  constructor(peer: IChildFrameRPCInterface, rpcSession: EncryptedRPCSession){
    super(peer, rpcSession);
  }
  async stringLength({str}: { str: string; }): Promise<number> {
    return str.length;
  }
  async splitString({str, delimiter}: { str: string; delimiter: string; }): Promise<string[]> {
    return str.split(delimiter);
  }

}

async function createChildFrame(childFrameSrc: string): Promise<ParentRPCHandlerClass>{
  const rpcSession = await createParentIFrameRPCSession(childFrameSrc);
  const handler = rpcSession.registerHandlerClass<ParentRPCHandlerClass, IChildFrameRPCInterface>(
    (peer, rpcSession)=>new ParentRPCHandlerClass(peer, rpcSession)
  );
  return handler;
}

async function demoParent() {
  // replace the line below with your iframe's URL
  const childFrameSrc = "https://example.com/iframe.html";

  // create a child iframe instance (this will add an invisible iframe to document.body)
  const childFrame1 = await createChildFrame(childFrameSrc);

  // you can call functions on childFrame.peer now
  const reversedArrayExample = await childFrame1.peer.reverseArray([1, 3, 5, 7]);
  console.log("your reversed array: ", reversedArrayExample);

  // the child iframe can throw exceptions and messages will be forwarded to the parent caller
  try {
    const childFrame1OldName = await childFrame1.peer.getName();
    // the code on the line below will not run because an exception is thrown
    console.log("the first iframe's name is: "+childFrame1OldName)
  }catch(err){
    // this will show the error 'my name has not yet been set'
    console.error("Child iframe threw an error: ",err);
  }

  await childFrame1.peer.setName("Mike");
  const childFrame1Name = await childFrame1.peer.getName();
  // the code on the line below will print "the iframe's name is: Mike"
  console.log("the first iframe's name is: "+childFrame1Name);

  // you can have multiple iframe instances at once
  const childFrame2 = await createChildFrame(childFrameSrc);
  await childFrame2.peer.setName("Sally");
  const childFrame2Name = await childFrame2.peer.getName();
  // the code on the line below will print "the iframe's name is: Mike"
  console.log("the second iframe's name is: "+childFrame2Name);

  // you can dispose of iframes (after this line, the first iframe will be removed from document.body)
  childFrame1.dispose();


  await childFrame2.peer.setName("I can still call functions on the second iframe because it has not been disposed");

  childFrame2.dispose();
}


demoParent()
  .catch(err=>{
    console.error("[parent] Error: ",err);
  });
```




## ❓ FAQ

**Why do we need to encrypt and sign messages between parent and child?**
Cross-domain iframe communication works using the [postMessage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), and can leak information/messages sent from other windows/iframe instances from the same origin.


## License

MIT. Copyright 2023 Zero Knowledge Labs Limited

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/safe-rpc-iframe?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/safe-rpc-iframe
[npm-downloads-src]: https://img.shields.io/npm/dm/safe-rpc-iframe?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/safe-rpc-iframe
[codecov-src]: https://img.shields.io/codecov/c/gh/OpenAssetStandards/safe-rpc-iframe/main?style=flat&colorA=18181B&colorB=F0DB4F
[codecov-href]: https://codecov.io/gh/OpenAssetStandards/safe-rpc-iframe
[bundle-src]: https://img.shields.io/bundlephobia/minzip/safe-rpc-iframe?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=safe-rpc-iframe
[license-src]: https://img.shields.io/github/license/OpenAssetStandards/safe-rpc-iframe.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/OpenAssetStandards/safe-rpc-iframe/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsDocs.io-reference-18181B?style=flat&colorA=18181B&colorB=F0DB4F
[jsdocs-href]: https://www.jsdocs.io/package/safe-rpc-iframe
