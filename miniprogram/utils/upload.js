
async function uploadFile(fileName, chooseResult) {
    return await wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: chooseResult
    });
  };
async function uploadImg(e) {

    //1、上传图片
    const res = await wx.chooseMedia({
      count:e,
      mediaType:['image'], //['image', 'video']
      sourceType:['album', 'camera']
    })
   
    //2、构造对象数组：存放本地临时url和构造云存储url
    const imgTempArray = res.tempFiles.map(item=>({
      tempUrl:item.tempFilePath,
      cloudPaths:"images/" + new Date().getTime() +"-"+ Math.floor(Math.random() * 1000)+item.tempFilePath.split('.').pop()
    }))
    // console.log(imgTempArray)
    //3、构造上传图片的方法放到一个待请求的promise任务数组
    const uploadTasks = imgTempArray.map((item, index) => {
      return  uploadFile(item.cloudPaths, item.tempUrl)
    });
    const cloudIds = await Promise.all(uploadTasks)
    //4、根据cloudId获取图片的https路径
    const newCloudIds = cloudIds.map(item=>item.fileID)
    const imageHttpArray = await wx.cloud.getTempFileURL({
      fileList:newCloudIds
    })
    //5、取https的url放到一个图片数组
    const newImageHttpArray = imageHttpArray.fileList.map(item=>item.tempFileURL)
    return newImageHttpArray
   
  }


export {
  uploadImg
}