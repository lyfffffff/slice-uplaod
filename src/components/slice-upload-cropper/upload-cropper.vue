<template>
	<div class="upload-wrap">
		<!-- 上传图片 -->
		<SliceUpload
			:before-upload="handleBefore"
			:onProgress="handleProgress"
			:onError="handleError"
			:onSuccess="handleSuccess"
			:showUploadList="false"
			@controllerReady="receiveController(uploadSec.controller, $event)"
		>
			<Button icon="ios-cloud-upload-outline">上传头像</Button>
		</SliceUpload>

		<!-- 图片缩略图 -->
		<div class="upload-list" v-show="uploadMes.visible">
			<templae v-if="uploadMes.status === 'finished'">
				<div class="upload-list-cover">
					<Icon type="ios-close" @click="removeImg"></Icon>
				</div>
				<img :src="uploadMes.src" />
			</templae>
			<template v-else>
				<Progress :percent="uploadMes.percent" hide-info></Progress>
			</template>
		</div>

		<!-- 图片裁剪窗 -->
		<Modal
			v-model="isShowTailor"
			title="裁剪图片"
			@on-ok="onUploadImage"
			@on-cancel="onCancelModal"
		>
			<div class="cropper">
				<VueCropper
					ref="cropper"
					class="cropper"
					:img="option.img"
					:outputType="option.outputType"
					:outputSize="option.size"
					:info="true"
					:full="option.full"
					:canMove="option.canMove"
					:canScale="option.canScale"
					:canMoveBox="option.canMoveBox"
					:original="option.original"
					:autoCrop="option.autoCrop"
					:autoCropWidth="option.autoCropWidth"
					:autoCropHeight="option.autoCropHeight"
					:fixed="option.fixed"
					:fixedNumber="option.fixedNumber"
					:centerBox="option.centerBox"
					:infoTrue="option.infoTrue"
					:fixedBox="option.fixedBox"
					:enlarge="option.enlarge"
					:mode="option.mode"
				></VueCropper>
			</div>
			<template v-slot:footer>
				<div class="row-center">
					<Button type="primary" @click="onUploadImage">保存</Button>
					<Button type="warning" @click="onCancelModal">取消</Button>
				</div>
			</template>
		</Modal>
	</div>
</template>

<script>
import SliceUpload from '../slice-upload';
import { VueCropper } from 'vue-cropper';
import 'vue-cropper/dist/index.css';
import { receiveController } from '../../utils';
export default {
	components: { SliceUpload, VueCropper },
	mixins: [receiveController.mixin],
	props: {
		isCopper: {
			type: Boolean,
			default: true,
		},
		isToCircle: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			uploadSec: {
				controller: {
					upload: null,
				},
			},
			isShowTailor: false, // 裁剪弹窗 显示/隐藏
			option: {
				img: '', // 裁剪图片的地址
				info: true, // 裁剪框的大小信息
				outputSize: 1, // 裁剪生成图片的质量
				outputType: 'png', // 裁剪生成图片的格式，可以防止图片背景透明或底图移动后，截图框裁剪到底图以外的透明区域，插件自动为截取的图片填充黑色背景
				canScale: false, // 图片是否允许滚轮缩放
				autoCrop: true, // 是否默认生成截图框
				autoCropWidth: 90, //默认生成截图框宽度
				autoCropHeight: 90, //默认生成截图框高度
				fixedBox: true, // 固定截图框大小 不允许改变
				fixed: true, // 是否开启截图框宽高固定比例
				fixedNumber: [1, 1], // 截图框的宽高比例
				full: true, // 是否输出原图比例的截图
				canMoveBox: true, // 截图框能否拖动
				canMove: false, // 上传图片是否可以移动
				original: false, // 上传图片按照原始比例渲染
				centerBox: true, // 截图框是否被限制在图片里面
				infoTrue: false, // true 为展示真实输出图片宽高 false 展示看到的截图框宽高
				enlarge: '1', // 图片根据截图框输出比例倍数
				mode: 'contain', // // 图片默认渲染方式 contain , cover, 100px, 100% auto
			},
			// 上传的图片信息
			uploadMes: {
				fileinfo: null,
				visible: false,
				src: '',
				status: '', // { '': 未开始, uploading: 上传中,  'finished': 成功, failed: 失败 }
				percent: 0,
			},
		};
	},
	methods: {
		// 重置上传信息
		resetUploadMes() {
			Object.assign(this.uploadMes, {
				fileinfo: null,
				visible: false,
				src: '',
				status: '',
				percent: 0,
			});
		},
		// 图片上传前
		handleBefore(file) {
			this.resetUploadMes();
			const { uploadMes } = this;
			uploadMes.visible = true;

			/** 1，不操作图片 */
			if (!this.isCopper && !this.isToCircle) {
				return true;
			}

			uploadMes.fileinfo = file;
			const data = window.URL.createObjectURL(new Blob([file]));

			/** 2，不裁剪 */
			if (!this.isCopper) {
				this.onCutImg(data);
				return false;
			}

			/** 3，裁剪+切圆 */
			this.option.img = data;
			this.isShowTailor = true;
			return false; // 取消自动上传
		},
		// 图片上传中
		handleProgress(file) {
			this.uploadMes.status = 'uploading';
			this.uploadMes.percent = file.percent;
		},
		// 图片上传成功
		handleSuccess() {
			this.uploadMes.status = 'finished';
		},
		// 图片上传失败
		handleError() {
			this.uploadMes.visible = false;
			this.uploadMes.status = 'failed';
			this.$Message.error('图片上传失败');
		},
		async onCutImg(data) {
			const { url, file } = await this.imageToCircle(data);
			this.uploadSec.controller.upload(file);
			this.uploadMes.src = url;
		},
		// 图片切圆
		imageToCircle(picUrl) {
			let radius, diameter, canvas, ctx;
			let img = new Image();
			img.setAttribute('crossOrigin', 'anonymous'); // 解决图片跨域访问失败
			// 1. 创建一个图片，将图片的 src 赋值为传入的图片
			img.src = picUrl;

			return new Promise((reslove) => {
				// 2. 图片需要加载，图片加载完成后将图片加载到画布中
				img.addEventListener(
					'load',
					() => {
						let { width, height } = img;
						if (img.width > img.height) {
							radius = height / 2;
						} else {
							radius = width / 2;
						}
						diameter = radius * 2;
						canvas = document.createElement('canvas');
						if (!canvas.getContext) {
							// 判断浏览器是否支持canvas，如果不支持在此处做相应的提示
							console.log('您的浏览器版本过低，暂不支持。');
							return false;
						}
						canvas.width = diameter;
						canvas.height = diameter;

						// 3. 获取画布的上下文
						ctx = canvas.getContext('2d');
						// 画一个矩形
						ctx.clearRect(0, 0, diameter, diameter);

						// 描边
						// 在矩形内部画一个内切圆的边框
						/**@focus 每完成一步，进行save 保留 */
						ctx.save(); // save和restore可以保证样式属性只运用于该段canvas元素
						ctx.strokeStyle = 'red'; //设置边线的颜色
						ctx.lineWidth = 2;
						ctx.beginPath(); //开始路径
						ctx.arc(radius, radius, radius - 5, 0, Math.PI * 2); //画一个整圆.
						/***@focus 将刚才画的轨迹变为边框 */
						ctx.stroke(); //绘制边线

						// 截圆
						// 画一个内切圆，并将画布至仅有该内切圆
						ctx.save();
						ctx.beginPath();
						ctx.arc(radius, radius, radius - 5, 0, Math.PI * 2);
						ctx.clip(); /***@focus 将刚才画的轨迹变为画布的范围 */

						let x = 0,
							y = 0,
							swidth = diameter,
							sheight = diameter;

						// 在该圆中填充图片 如果图片是从网络加载 ，最好等 img.onload 后再绘制
						ctx.drawImage(
							img,
							x,
							y,
							swidth,
							sheight,
							0,
							0,
							diameter,
							diameter
						);
						ctx.restore();

						// toDataURL()是canvas对象的一种方法，用于将canvas对象转换为base64位编码
						let dataURL = canvas.toDataURL('image/png');
						canvas.toBlob(async (blob) => {
							const fileOfBlob = new File(
								[blob],
								this.uploadMes.fileinfo.name,
								{ type: blob.type }
							);
							reslove({ url: dataURL, file: fileOfBlob });
						});
					},
					false
				);
			});
		},
        // 取消裁剪图片，即是取消上传
		onCancelModal() {
			this.isShowTailor = false;
			this.resetUploadMes();
		},
        // 上传图片
		onUploadImage() {
			this.$refs.cropper.getCropBlob((imgBlob) => {
				const reader = new FileReader();
				reader.readAsDataURL(imgBlob);
				reader.onload = async (e) => {
					const src = e.target.result;
					let file = null;
					if (!this.isToCircle) {
						file = new File(
							[imgBlob],
							this.uploadMes.fileinfo.name,
							{
								type: imgBlob.type,
							}
						);
						this.uploadMes.src = src;
					} else {
						const { url, file: fileMes } = await this.imageToCircle(
							src
						);
						file = fileMes;
						this.uploadMes.src = url;
					}
					this.isShowTailor = false;
					this.uploadSec.controller.upload(file);
				};
			});
		},
	},
};
</script>

<style lang="less" scoped>
.upload-wrap {
	float: left;
	display: flex;
	align-items: center;
}
.upload-list {
	width: 60px;
	height: 60px;
	text-align: center;
	line-height: 60px;
	border: 1px solid transparent;
	border-radius: 4px;
	overflow: hidden;
	background: #fff;
	position: relative;
	box-shadow: 0 0 1px rgba(0, 0, 0, 0.2);
	margin-left: 10px;
	border: 1px solid #ddd;
	padding: 2px;
	img {
		max-width: 100%;
	}
	.upload-list-cover {
		display: none;
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.6);
		i {
			color: #fff;
			font-size: 20px;
			cursor: pointer;
			margin: 0 2px;
		}
	}
	&:hover .upload-list-cover {
		display: block;
	}
}

.cropper {
	width: auto;
	height: 300px;
}
</style>
