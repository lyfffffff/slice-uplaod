<template>
	<div>
		<SliceUpload
			:onError="handleError"
			:onSuccess="handleSuccess"
			:onProgress="handleProgress"
		>
			<Button icon="ios-cloud-upload-outline">上传文件</Button>
		</SliceUpload>
		<UploadCropper> </UploadCropper>
	</div>
</template>

<script>
import SliceUpload from './components/slice-upload';
import UploadCropper from './components/slice-upload-cropper';
export default {
	name: 'App',
	components: { SliceUpload, UploadCropper },
	methods: {
		handleError(res, file) {
			console.log('onError start');
			console.log('res', res);
			console.log('file', file);
			console.log('onError end');
		},
		onSuccess(res, file, fileList) {
			console.log('onSuccess start');
			console.log('res', res);
			console.log('file', file);
			console.log('fileList', fileList);
			console.log('onSuccess end');
		},
		onProgress(e, file, fileList) {
			console.log('onProgress start');
			console.log('e', e);
			console.log('file', file);
			console.log('fileList', fileList);
			console.log('onProgress end');
		},
	},
};
</script>

<style></style>
