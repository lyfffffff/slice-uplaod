[toc]

**前言**

**什么是 upload？**

> upload 是一个用于**上传文件**的组件，通过 `input[type=file]` 标签打开文件管理器，将选中文件发送到服务器。

**现有 upload 组件的不足**

- 文件过大时请求时间过长会报连接错误（503）
- 没有常见的取消或暂停操作
- 若浏览器刷新或退出无法保存传载进度条

**简要概括本文的内容**

一、 理解 upload 组件的原理

```
包括 File 对象和 http 请求。
以及延伸的 Blod 对象、请求回调、请求头等。
```

二、自定义 upload 组件

```
通过切片上传实现上传暂停、上传大文件、刷新浏览器保留进度条等功能。
以及功能优化：切片上传失败后尝试重新上传、多次切片上传失败后终止所有上传。
以及最终源码地址。
```

三、upload 组件结合业务

```
常见的业务有，选择图片后进行裁剪后上传。
进阶业务：裁剪图片后将图片截为圆形后上传（APP头像）。
```

四、总结与补充

```
一些前文所用的技术补充和总结。
包括：常见的 `content-type`、`async awiat` 的应用、'canvas' 的使用、'vue-cropper' 库等。
```

## upload 组件

upload 组件分为**文件**和**上传**两部分，对应的是 File 对象和 http 请求。

学习二者相关的技术，可以实现对文件上传更精细的控制。

### File 对象

**文件存储位置**

1. 选择文件

> onchange 事件，文件信息存储在 `e.target.files` 中

2. 拖拽文件

> onpaste 事件，文件信息存储在 `e.clipboardData.files` 中

3. 黏贴文件

> ondrop 事件，文件信息存储在 `e.dataTransfer.files` 中

**文件的本质—— File 对象**

File 对象包含六个常见的属性：

- lastModified

> 只读，返回文件最后修改时间的毫秒数

- lastModifiedDate

> 只读，返回文件最后修改时间的 Date 对象

- name

> 只读，返回文件的名字

- size

> 只读，返回文件的大小

- type

> 只读，返回文件的 MiME Type

- webkitRelativePath

> 文件在网页中的相对路径

**创建 file 实例**

> new File(bits, name[, options])
>
> - bits
>     数组，项为 ArrayBuffer，ArrayBufferView，Blob，或者 DOMString 对象（字符串）
> - name
>     文件名称
> - options
>     文件可选属性

例子

```js
const file = new File(['my name'], 'infoTxt', {
 type: 'text/plain',
});
```

**File 对象与 Blob 对象**

`File` 继承自 `Blob` 对象，可将 `File` 理解为一种特殊的 `Blob` 对象。

`File` 实例将文件的真正内容，即**二进制数据**，存放在对象原型 `Blob` 中。

`File` 没有定义任何方法，它从 `Blob` 中继承了 `slice` 方法，此方法可用于**切割文件**。

```js
File.__proto__ == Blob; // => true
File.prototype.__proto__ == Blob.prototype; // => true
let file = new File();
file.__proto__.__proto__ == Blob.prototype; // => true
```

#### Blob 对象

**创建 Blob 实例**

> new Blob( array, options )
>
> - array
>     和 File 相同
> - options
>     可选属性

例子

```js
const blob = new Blob(['blob test'], {
 type: 'text/plain', // 文件类型，默认为 text/plain，即 txt 文件
});
```

### http 请求

**请求区别**

上传文件的请求和普通请求的区别在于**两个部分**：

- 发送请求的数据为 `formData` 对象
- 发送请求的 `content-type` 为 `'multipart/form-data'`

**进度条和上传结果**

Upload 组件对用户抛出了几个周期函数钩子，这是通过 `http` 请求实现的。

以 iview 组件库的 Upload 组件为例，在 `http` 请求的**触发的回调中**抛出周期函数：

- 请求中（upload.onprogress）-> 文件上传中（onProgress）
- 请求成功（onload）-> 文件上传失败（onError）
- 请求失败（onerror）-> 文件上传成功（onSuccess）

## 自定义 upload 组件

**重点：切片上传。**

为什么要切片上传？

- 解决**文件过大**导致的上传失败
- **暂停**即先传一部分，点击继续再上传剩下的，只有切片才能将文件分为一部分一部分
- 切片在刷新浏览器后可以只对剩下的切片发送请求，即**重新上传保留进度条**

### 切片上传 v1.0

实现一个最简单的切片上传，不包含暂停、进度条、重新上传等功能。解决：

- 怎么切？
- 怎么将切片文件重新组合成原来的文件？

**怎么切**

- 切割
    结合上文，选中的文件对象 `File` 有一个 `slice` 方法，可以将文件切割成一份份。

- 每片大小
    给出一个切片大小 `size` 和最大片数 `n`。
    如果切片数超出了 `n`，则按照最大片数 `n` 切割，若没有超出最大片数 `n`，则按 `size` 大小切片。

```js
let size = 2 * 1024; // 固定每片为 2k 大小
let n = 20; // 最大切片数
let count = Math.ceil(file.size / size); // 切片数
let slices = []; // 切片数组
if (count > n) {
 // 限制切片的数量不能超过 n 个，超过则重新计算每个切片的大小
 size = file.size / n;
 count = n;
}
```

**怎么组合**

将上述切片数组 `slices` 遍历发送请求即可以切片上传，但是会有以下问题：

- 服务端无法保证接收顺序
- 若两个 Upload 同时上传，服务端无法识别所接收到的切片来自哪一个文件
- 服务端无法保证接收到了全部切片

举例：好比你按顺序发了多个快递，但不能保证对方收到快递的顺序，也不能保证里面会不会夹着其他快递。

通过**给切片命名的方法**解决问题一和二，浏览器通过该命名确定切片顺序和来源。

通过上传完所有切片后，**再次发送一个合并上传的请求**给服务器解决问题三。

**1. 切片命名**

给每个切片定义唯一标识，这个标识可以确定它来自哪个文件，所处的片段。

文件来源标识通过 `spark-md5` 库和 `FileReader` 类实现。

> 切片名
> 文件来源标识\_索引.文件后缀
> eg：e0b46c064e232bcd67815c72dbcb50f0_2.md

```js
import SparkMD5 from 'spark-md5';
let spark = new SparkMD5.ArrayBuffer();
let reader = new FileReader();

let hash; // 最终文件来源标识

reader.readAsArrayBuffer(file); // 1，将文件读取为 ArrayBuffer 字节数组

// 2，读取完毕
reader.onload = (e) => {
 spark.append(e.target.result);
 hash = spark.end(); // 3，利用 ArrayBuffer 字节数组获取文件的 hash 值
};
```

> Tips
> `spark-md5` 库和 `FileReader` 类的介绍和使用作为补充知识，放在最后一章。

**2. 合并上传**

当所有切片上传完毕后，再向服务器发送一个请求。

参数传==文件唯一标识 hash== 和==总切片数 count==。

用于告知服务器目标文件已上传完毕，由其根据文件标识，找齐所有切片并进行合并。

**总结**

此时，完成了切片上传和解决了文件上传后的组合问题。

### 切片上传 v1.1

基于上述的 1.0 版本，对切片上传实现进度条功能。

iview 组件库的 Upload 组件，通过 `ajax` 自带的 `upload.onprogress` 事件获取请求上传进度。

而切片上传是一次性发送多个请求，进度条应改为：**已上传切片数/总切片数**

```js
let count = 20; // 总切片数
let complete = 0; // 已上传切片数

// 循环体，每次切片上传成功后，执行下列代码
complete++;
percent = ((complete / count) * 100).toFixed(2);
```

### 切片上传 v1.2

基于上述的 1.1 版本，对切片上传实现断点续传功能。

**什么是断点续传？**

即网络有误、页面刷新、网页关闭等情况，再次回到页面时，继续剩下的上传。

**实现断点续传**

将已上传的切片在**本地**保存起来，每次上传切片前，都先判断其是否上传过，有则跳过，无则上传。

并在一个文件完整上传后，移除本地保存，以便再次上传。

```js
// 1, 上传前，判断切片是否包含在
let recordSlice = JSON.parse(localStorage.getItem(hash)) // 获取所有切片，hash 为文件唯一标识
recordSlice.includes(fileSlice) ? ...code... : ...code...

// 2, 上传后，保存切片
let list = JSON.parse(localStorage.getItem(hash));
list.push(fileSlice);
localStorage.setItem(hash, JSON.stringify(list));

// 3, 所有上传完毕，移除全局
localStorage.removeItem(hash);
```

### 切片上传 v2.1

基于切片上传版本一，实现==暂停继续==功能。

**先思考一个问题**，文件切片和上传暂停究竟是不是一体的，即我能不能单独实现上传暂停。

答案： 当然是 no！

对于已发送的请求，客户端是无法进行暂停的，只能进行取消。

原生的 Upload 组件一文件一请求，暂停点击继续时，重新发送请求，进度条从 0 开始，本质就是取消而不是暂停。

**结论：** 若只有一个请求，就没有暂停的说法，只有取消！

**怎么暂停？**

为每一个上传文件配置一个暂停按钮，单次点击取消该文件剩余切片上传，再次点击继续上传该文件剩余切片。

- axios 的 CancelToken
- 文件专属 CancelToken

取消上传操作通过 axios 的 CancelToken，下面是使用例子。

```js
const CancelToken = axios.CancelToken;
const source = CancelToken.source();

axios
 .post('#', data, {
  cancelToken: source.token,
 })
 .catch((err) => {
  if (axios.isCancel(err)) {
   // 判断错误是否是中断请求引起的
   console.log(err.message); // 'canceled by the user.'
   return;
  }
 });
// 取消请求（参数为 message ）
source.cancel('canceled by the user.');
```

为了避免一次性上传多个文件时 CancelToken 将影响到其他文件，应为每个文件配置一个各自 CancelToken。

继续上传的逻辑已在断点续传中实现过。

### 切片上传 v3.1

以上我们实现了一个可以暂停取消、断点续传的 Uploda 组件。

提高上传成功率的同时，也带了问题————**请求冗余**。

想象上传失败的场景：

普通 Upload 组件，发送一个请求，若请求失败，则上传失败。

本文的 Upload v2.1，当某个切片请求上传失败时，剩下的切片仍在上传，此时出现两种情况：

- 一是剩下的切片也上传失败，进度条卡住，直至最后一个切片上传失败，显示上传失败。

- 二是剩下的切片上传成功，进度条变长，直至最后一个切片上传完，进度条到顶时，显示文件上传失败。

不论如何，上传必然失败，但是却多等了 n 个请求！

故思考，**切片上传出现请求失败时，如何适时停止上传并提示上传失败？**

1. 只要出现上传失败，我就立刻取消剩余上传！
   **激进派，太简单粗暴了！**

2. 对于上传失败的切片，我就一直重新上传，直到成功为止！
   **顽固派，太钻牛角尖了！**

3. 尝试重新上传
   对于上传失败的切片，应尝试重新上传，若**多次**上传该切片失败时，证明文件整体上传不会成功，也不必上传剩下的切片，直接抛出错误。

所以，都选 C ！

基于上述 Upload，实现==上传失败==功能。

**怎么在切片上传失败后，立刻进行重新上传？**

首先，上述在点击上传文件的一瞬间，发送了所有切片请求，等到一个请求失败想要再次上传，则该请求必然是排在所有请求之后。

![upload-slice-error.png](https://s2.loli.net/2023/05/15/PcfMh34lKYAGBUC.png)

故，**不能在一次性发送所有切片请求！**

使用 `async-await + 栈操作+ 递归` 控制请求流：

- start：出栈 n 个切片
- 对该 n 个切片进行发送请求，若请求成功，继续 start
- 若请求失败，记录该切片**请求失败次数**，将该切片重新入栈，继续 start（此时栈顶是失败切片，确保上传失败后**立即**重新上传）
- 若该切片失败次数达到 3 次，则取消所有请求并抛出上传失败钩子

```js
let limit = 3;
while (limit > 0) {
    limit--;
    start(); // 并发出栈三个，发送三个请求
}

const start = async () => {
    if(slices.length==0) return
    let task = slices.shift(); // 1，切片文件出栈
    try {
        record.includes(task.filename) && start();// 2，判断是否上传过该切片

        await axios.post(this.action, formData, {
            cancelToken: file.source.token,
        }); // 3，若失败，则进入 catch，成功，执行接下代码

        ...code...

        start();
    } catch (err) {

        // 4，上传出错，若出错三回就暂停上传
        task.error++;

        if (task.error > 2) {
            this.handleError(err.response, file); // 上传失败钩子
        } else {
            slices.unshift(task); // 重新入栈
            start();
        }
    }
};

```

### 最终的 Upload 组件

综上，我们完成了一个 Upload 组件的功能，基于 iview 组件库的 Upload，我自定义了一个 slice-upload 组件。

#### API

| 属性名         | 描述                   | 类型     | 默认值                                  | 是否必须 |
| -------------- | ---------------------- | -------- | --------------------------------------- | -------- |
| action         | 请求接口               | string   | '//jsonplaceholder.typicode.com/posts/' | 否       |
| multiple       | 是否可以多选           | boolean  | false                                   | 否       |
| mockError      | 是否模拟上传失败       | boolean  | false                                   | 否       |
| showUploadList | 是否显示已上传文件列表 | boolean  | true                                    | 否       |
| beforeUpload   | 上传文件之前的钩子     | Function | -                                       | 否       |
| onProgress     | 文件上传时的钩子       | Function | -                                       | 否       |
| onSuccess      | 文件上传成功时的钩子   | Function | -                                       | 否       |
| onError        | 文件上传失败时的钩子   | Function | -                                       | 否       |

#### Events

| 方法名          | 描述                                                                         | 参数 |
| --------------- | ---------------------------------------------------------------------------- | ---- |
| controllerReady | 抛出了一个对象，其中包含供给用户接收方法 upload。upload 方法用于传入一个文件，直接进行上传 | 无   |

> Tips
> iview 组件库为用户提供了一个 `clearFiles` 方法。通过 `this.$refs.upload.clearFiles` 调用。
> 但其本质不就是子组件调用父组件方法嘛？
> 这样我通过 `$refs` 调用 upload 组件里的任意方法都 ok 的。
> 通过 `$refs` 调用父组件数据和方法是很不提倡滴！
> 故还不如我抛出指定的方法的集合呢！

```js
// upload 组件
mounted() {
  this.$emit('controllerReady', {
   upload: this.postSlice,
  });
 }

// 用户在一个对象中接收组件抛出的方法，在需要的地方使用
<SliceUpload
 @controllerReady="receiveController(uploadSec.controller, $event)"
>
 <Button icon="ios-cloud-upload-outline">上传头像</Button>
</SliceUpload>

function receiveController(to, from) {
 Object.assign(to, from);
}
```

#### 源码

[源码地址](https://github.com/lyfffffff/slice-uplaod)，位于 `components/slice-upload`

## Upload 组件结合业务

既然已经开发好了一个组件，第一件事当然是用起来啦！

结合业务————头像上传

进阶业务———— QQ 头像上传

关键在于选完图片后，对选择的图片进行裁剪，将裁剪完的图片进行上传。

## 总结与补充
