<template>
	<div :class="ns.s()">
		<div :class="ns.m('select')" @click="onClickHandle">
			<input
				type="file"
				:class="ns.m('input')"
				@change="onSelectFiles"
				:multiple="multiple"
				ref="input"
			/>
			<!-- 用户自定义样式 -->
			<slot></slot>
		</div>
		<UploadList
			v-if="showUploadList"
			:files="fileList"
			@on-file-remove="handleRemove"
			@on-file-pause="handlePause"
		></UploadList>
	</div>
</template>

<script>
/**
 * @author lyfffffff
 * @name Upload 组件
 * @description 通过切片上传实现暂停继续、断点续传功能；通过 async-await 实现上传失败功能。
 *
 */

import UploadList from './upload-list.vue';

import { useNamespace, proStorage } from '../../utils';
import SparkMD5 from 'spark-md5';
import axios from 'axios';

export default {
	components: { UploadList },
	props: {
		// 模拟上传失败
		mockError: {
			type: Boolean,
			dafault: false,
		},
		// 请求接口
		action: {
			type: String,
			default: '//jsonplaceholder.typicode.com/posts/',
		},
		// 是否可以多选
		multiple: {
			type: Boolean,
			default: false,
		},
		// 是否显示上传文件
		showUploadList: {
			type: Boolean,
			default: true,
		},
		beforeUpload: {
			type: Function,
			default() {
				return {};
			},
		},
		onProgress: {
			type: Function,
			default() {
				return {};
			},
		},
		onSuccess: {
			type: Function,
			default() {
				return {};
			},
		},
		onError: {
			type: Function,
			default() {
				return {};
			},
		},
	},
	data() {
		return {
			ns: new useNamespace('ivu-upload'), // 类前缀
			/**
			 * 文件信息
			 * { status, name, size, percentage, complete, uid, showProgress, source, count, hash }
			 * { 上传状态, 文件名, 文件大小, 文件上传百分比, 已上传片数, uid, 显示进度条, 取消上传开关, 文件片数, 文件hash值 }
			 */
			fileList: [], // 文件信息
			maxSlicesNum: 20, // 最大切片数
			tempIndex: 1, // 文件编号
			loadingFile: [], // 上传中的文件
		};
	},
	mounted() {
		this.$emit('controllerReady', {
			upload: this.postSlice,
		});
	},
	methods: {
		/** 点击组件，打开文件选择器 */
		onClickHandle() {
			this.$refs.input.click();
		},
		/** 选择文件 */
		onSelectFiles(e) {
			const files = e.target.files;
			if (!files) return;
			this.filesUpload(files);

			/** @foucs 将值清空，防止下次选择相同文件时，不触发 change 事件 */
			this.$refs.input.value = null;
		},
		/** 处理文件，并上传 */
		filesUpload(files) {
			let filesList = Array.prototype.slice.call(files);
			if (!this.multiple) filesList = filesList.slice(0, 1);
			filesList.forEach((file) => {
				this.loadingFile.push(file);
				this.upload(file);
			});
		},
		/** 上传文件 */
		upload(file) {
			if (!this.beforeUpload) {
				this.postSlice(file);
			}

			const before = this.beforeUpload(file);
			if (before) {
				this.postSlice(file);
			}
		},
		/** 切片上传 */
		async postSlice(file) {
			// 获取切片
			const { slices, hash, count } = await this.sliceFile(file);

			// 存储文件信息
			this.setFileMes(file, { count, hash });

			// 断点续传、暂停续传，需获取已上传切片列表
			const record = proStorage.fetch(hash);

			// 对每个切片进行上传
			const start = async () => {
				let task = slices.shift();
				if (!task) return;

				try {
					// 1, 该切片已上传过，修改进度条，返回
					if (record.includes(task.filename)) {
						this.progressHandle(file);
						slices.length > 0 && start();
						return;
					}

					// 2, 没上传过，进行上传。修改进度条，保存已上传切片
					let formData = new FormData();
					formData.append(task.filename, task.file);

					await axios.post(this.action, formData, {
						cancelToken: file.source.token,
					});

					this.progressHandle(file);
					this.saveUploadSlice(hash, task.filename);
					slices.length > 0 && start();
				} catch (err) {
					// 暂停上传
					if (axios.isCancel(err)) {
						console.log('已中断上传文件');
						return;
					}

					// 上传出错，若出错三回就取消上传
					task.error++;

					if (task.error > 2) {
						/** @foucs 其他请求可能尚在上传，需要终止 */
						file.source.cancel('interrupt');
						this.$Message.warning('上传失败');
						if (err.response) {
							this.handleError(err.response, file);
						} else {
							this.handleError(err.request, file);
						}
					} else {
						slices.unshift(task);
						start();
					}
				}
			};

			// 单次只发送三个请求

			let limit = 3;
			while (limit > 0) {
				limit--;
				start();
			}
		},
		// 初始化文件信息
		setFileMes(file, options) {
			const { count, hash } = options;
			const { fileList } = this;
			const target = fileList.find((item) => item.uid == file.uid);

			/**
			 * 断点续传 or 暂停继续
			 */
			if (target) {
				/** @foucs  将进度条设为0，上传时会重新验证 */
				target.complete = 0;
				file.source = axios.CancelToken.source(); // 重新设置取消
				return;
			}

			file.uid = Date.now() + this.tempIndex++;
			file.source = axios.CancelToken.source();

			const { name, size, uid, source } = file;
			const _file = {
				status: 'uploading',
				name,
				size,
				percentage: 0,
				complete: 0,
				uid,
				showProgress: true,
				source,
				count,
				hash,
			};

			fileList.push(_file);
		},
		// 对文件进行切片
		async sliceFile(file) {
			// 1，确定切片数和每片大小
			const maxNum = this.maxSlicesNum; // 最大切片数
			let maxSize = 2 * 1024; // 默认 2k 大小
			let count = Math.ceil(file.size / maxSize);
			let slices = []; // 切片文件
			if (count > maxNum) {
				// 限制切片的数量不能超过 20，超过则重新计算每个切片的大小
				maxSize = file.size / maxNum;
				count = maxNum;
			}

			// 2，切片并命名
			let index = 0;
			const { hash, suffix } = await this.SparkMD5Hash(file); // 获取当前文件的 hash 值和文件后缀
			while (index < count) {
				/*** @foucs  通过将某一片设置的很大，模拟切片上传失败 */
				const nextIndex =
					this.mockError && index == 2 ? index + 20 : index + 1;
				slices.push({
					file: file.slice(index * maxSize, nextIndex * maxSize),
					filename: `${hash}_${index + 1}.${suffix}`,
					error: 0,
				});
				index = nextIndex;
			}
			return { slices, hash, count };
		},
		/**
		 * 获取文件唯一标识和后缀
		 */
		SparkMD5Hash(file) {
			return new Promise((resolve) => {
				const spark = new SparkMD5.ArrayBuffer();
				const reader = new FileReader();
				reader.readAsArrayBuffer(file);
				reader.onload = (e) => {
					spark.append(e.target.result);
					const hash = spark.end();
					const suffix = /\.([0-9a-zA-Z]+)$/.exec(file.name)[1];
					resolve({
						hash,
						suffix,
					});
				};
			});
		},
		// 控制进度条，若进度条为百分百，发送合并请求
		progressHandle(file) {
			const _file = this.fileList.find((item) => item.uid == file.uid);
			const { count, hash } = _file;

			let complete = ++_file.complete;

			let percent = ((complete / count) * 100).toFixed(2); // 进度条百分比
			_file.percentage = percent || 0;
			this.handleProgress({ percent }, file);

			let timer = null;
			switch (true) {
				case complete < count:
					break;
				case complete > count:
					clearTimeout(timer);
					console.log('上传数大于切片数，有文件上传了不止一次');
					break;
				case complete == count:
					timer = setTimeout(async () => {
						try {
							const res = await axios.post(
								this.action,
								{
									hash,
									count,
								},
								{
									headers: {
										'Content-Type':
											'application/x-www-form-urlencoded',
									},
								}
							);
							this.handleSuccess(res, file);
							proStorage.remove(hash); // 文件清除
						} catch (e) {
							this.handleError(e);
						}
					}, 3000);
					break;
			}
		},
		// 保存已上传切片
		saveUploadSlice(hash, filename) {
			const list = proStorage.fetch(hash);
			list.push(filename);
			proStorage.save(hash, list);
		},
		// 上传中
		handleProgress(e, file) {
			const _file = this.fileList.find((item) => item.uid == file.uid);
			this.onProgress(e, _file, this.fileList);
		},
		// 上传成功
		handleSuccess(res, file) {
			const _file = this.fileList.find((item) => item.uid == file.uid);

			if (_file) {
				_file.status = 'finished';
				_file.response = res;

				this.loadingFile.splice(this.loadingFile.indexOf(file), 1);

				this.onSuccess(res, _file, this.fileList);

				setTimeout(() => {
					_file.showProgress = false;
				}, 1000);
			}
		},
		// 上传失败
		handleError(response, file) {
			const { fileList } = this;
			const _file = fileList.find((item) => item.uid == file.uid);

			_file.status = 'fail';

			fileList.splice(fileList.indexOf(_file), 1);

			this.onError(response, file);
		},
		// 移除文件
		handleRemove(file) {
			const fileList = this.fileList;
			fileList.splice(fileList.indexOf(file), 1);
		},
		// 暂停文件上传
		handlePause(file, pause) {
			if (pause) {
				file.status = 'pause';
				file.source.cancel('pause');
			} else {
				file.status = 'loading';
				const loadingFile = this.loadingFile.find(
					(item) => item.uid == file.uid
				);
				loadingFile && this.postSlice(loadingFile);
			}
		},
	},
};
</script>

<style lang="less" scoped></style>
