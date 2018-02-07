// -- By CenJiYuan
const shell = require('shelljs'),
    getPixels = require('get-pixels')

// 小黑人最底部颜色范围
function isBlack({r, g, b}) {
    return r < 65 && r > 50 && g < 65 && g > 50 && b > 90 && b < 110
}

// 生成随机数
function random() {

}

// 通过 adb 将手机截屏拉到项目目录下
function pull_screenshot() {
    shell.exec('adb shell screencap -p /sdcard/1.png')
    shell.exec('adb pull /sdcard/1.png .')
}

// 获取图片数据
function pxData() {
    return new Promise((resolve, reject) => {
        getPixels(__dirname + '/1.png', (err, pixels) => {
            if (err) {
                reject(err)
                return
            }
            resolve(pixels)
        })
    })
}

// 获取某一点的RGB值
function getRGB(pixels, x, y) {
    let r = pixels.get(x, y, 0)
    let g = pixels.get(x, y, 1)
    let b = pixels.get(x, y, 2)
    return {r, g, b}
}

// 获取小黑人坐标及目标点坐标
async function getPosition() {
    try {
        const pixels = await pxData()
        console.log(`图片分辨率：宽${pixels.shape[0]}px,高${pixels.shape[1]}px`)
        let width = pixels.shape[0]
        let height = pixels.shape[1]
        // 通过对左上、右上、左下、右下取点计算背景色取值范围(宽高范围分别缩小30个像素,以防止边界像素影响)
        let {r: r1, g: g1, b: b1} = getRGB(pixels, 30, 30)
        let {r: r2, g: g2, b: b2} = getRGB(pixels, width - 30, 30)
        let {r: r3, g: g3, b: b3} = getRGB(pixels, 30, height - 30)
        let {r: r4, g: g4, b: b4} = getRGB(pixels, width - 30, height - 30)
        let redMax = Math.max(r1, r2, r3, r4)
        let redMin = Math.min(r1, r2, r3, r4)
        let greenMax = Math.max(g1, g2, g3, g4)
        let greenMin = Math.min(g1, g2, g3, g4)
        let blueMax = Math.max(b1, b2, b3, b4)
        let blueMin = Math.min(b1, b2, b3, b4)
        // 从图片左上角由左到右,由上到下扫描图片,先找出小黑人坐标
        console.log(`正在扫描图片,计算小黑人底部坐标...`)
        let black = [] // 用于记录一行中连续符合小黑人颜色范围的数组
        let blackPoint // 记录最终确定的小黑坐标
        // y轴方向上下分别减少300px,x轴方向左右分别减少100px,以防止游戏内文字等其他因素影响色块判断
        for (let i = 300; i < height - 300; i++) {
            for (let j = 100; j < width - 100; j++) {
                let px = getRGB(pixels, j, i)
                // 当此色块不属于背景色时,开始分析
                if (!(px.r <= redMax && px.r >= redMin && px.g <= greenMax && px.g >= greenMin && px.b <= blueMax && px.b >= blueMin)) {
                    if (!blackPoint) {
                        if (isBlack(px)) {
                            // 将符合条件的连续点放入black数组
                            black.push({
                                x: j,
                                y: i
                            })
                        } else {
                            // 当横向扫描到非小黑的色块时,判断此行是否为小黑底部
                            // 判断是否有连续5个以上连续符合条件的色块
                            if (black.length > 5) {
                                // 取black数组中间一位,如果y + 1的像素块在灰色范围内,则该点为小黑底部的中间点
                                let middle = black[Math.round((black.length - 1) / 2)]
                                middle.y += 1
                                let midPx = getRGB(pixels, middle.x, middle.y)
                                if (midPx.g > 85) {
                                    middle.y -= 20 // 底部中间点坐标向上20个像素即为小黑底部中间点坐标(估计值)
                                    blackPoint = middle // 记录小黑块底部中间坐标
                                }
                            }
                            black = [] // 当相似点不连续时，重置black数组
                        }
                    }
                }
            }
        }
        if (blackPoint) {
            console.log(`小黑坐标为：x:${blackPoint.x},y:${blackPoint.y}`)
            // 如果找到小黑点，则开始分析目标点坐标
            console.log(`正在分析目标点位置...`)
            // 扫描目标点的x轴取值范围
            let startX, endX
            // 如果小黑的位置在屏幕左半部分,则目标点一定在屏幕右半部分,反之一样
            if (blackPoint.x > width / 2) {
                startX = 100
                endX = width / 2
            } else {
                startX = width / 2
                endX = width - 100
            }
            // 记录目标平台的顶点坐标和最右点坐标
            // 取目标平台的最顶点和最右点(因为游戏中阴影方向为左上,因此取最右点),最右点x坐标与顶点y坐标即为目的坐标
            // 此算法非最优,计算结果非精确中心点,待优化
            let topPoint, rightPoint
            // 从左上角开始,由上向下,由左到右依次扫描
            for (let i = startX; i < endX; i++) {
                for (let j = 300; j < height - 300; j++) {
                    let px = getRGB(pixels, i, j)
                    // 当此色块不属于背景色时,记录该点
                    if (!(px.r <= redMax && px.r >= redMin && px.g <= greenMax && px.g >= greenMin && px.b <= blueMax && px.b >= blueMin)) {
                        // 当扫描到的符合条件的色块y值小于已记录的值,则用新值覆盖旧值
                        if (!topPoint || topPoint.y > j) {
                            topPoint = {
                                x: i,
                                y: j
                            }
                        }
                        // 这里增加最右点取点时的判断,由于起点平台的阴影会映射到目标平台的区域
                        // 如果下个取点y轴方向下落距离超过100px,则判定为阴影区域
                        if (!rightPoint || j - topPoint.y < 100) {
                            rightPoint = {
                                x: i,
                                y: j
                            }
                        }
                        break
                    }
                }
            }
            if (topPoint && rightPoint) {
                let target = {
                    x: topPoint.x,
                    y: rightPoint.y
                }
                console.log(`目标点坐标为：x:${target.x},y:${target.y}`)
                return {target, blackPoint}
            } else {
                console.log(`未获取到目标点`)
            }
        } else {
            console.log(`未找到小黑坐标`)
        }
    } catch (err) {
        console.error(err)
    }
}

// 执行起跳命令
function jump() {
    // 模拟点击屏幕的命令
    shell.exec(`adb shell input swipe ${width} ${height} ${width} ${height} ${press_time}`)
}

function auto() {
    console.log('获取屏幕截图')
    pull_screenshot()
    getPosition().then((res) => {
        if (res) {
            console.log(res)
        }
    })
}
getPosition().then((res) => {
    if (res) {
        console.log(res)
    }
})
