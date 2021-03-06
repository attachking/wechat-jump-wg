// -- Created By ChenJiYuan
const shell = require('shelljs'),
    getPixels = require('get-pixels')

// 背景色取值范围
let redMax, redMin, greenMax, greenMin, blueMax, blueMin

// 判断是否为背景色
function isBg(r, g, b) {
    return r <= redMax + 5 && r >= redMin - 5 && g <= greenMax + 5 && g >= greenMin - 5 && b <= blueMax + 5 && b >= blueMin - 5
}

// 小黑人最底部颜色范围
function isBlack({r, g, b}) {
    return r < 65 && r > 45 && g < 70 && g > 45 && b > 85 && b < 115
}

// 判断两色是否相近
function isSimilar(r1, g1, b1, r2, g2, b2) {
    return Math.abs(r1 - r2) < 10 && Math.abs(g1 - g2) < 10 && Math.abs(b1 - b2) < 10
}

// 疑似小黑范围,用于目标点查找
function isBlack2({r, g, b}) {
    return r < 75 && r > 45 && g < 70 && g > 45 && b > 55 && b < 115
}

// 生成随机数(整数)
function random(min, max) {
    return Math.round(Math.random() * max + max - min)
}

// 通过 adb 将手机截屏拉到项目目录下
function screenShot() {
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

// 获取图片某一点的RGB通道值
function getRGB(pixels, x, y) {
    let r = pixels.get(x, y, 0) // red
    let g = pixels.get(x, y, 1) // green
    let b = pixels.get(x, y, 2) // blue
    return {r, g, b}
}

// 获取小黑人坐标及目标点坐标
async function getPosition() {
    try {
        const pixels = await pxData()
        console.log(`图片分辨率：宽${pixels.shape[0]}px,高${pixels.shape[1]}px`)
        let width = pixels.shape[0]
        let height = pixels.shape[1]
        // 通过对左上、右上、左下、右下取点计算背景色取值范围(宽高范围分别缩小10个像素,以防止边界像素影响)
        let {r: r1, g: g1, b: b1} = getRGB(pixels, 10, 10) // 左上
        let {r: r2, g: g2, b: b2} = getRGB(pixels, width - 10, 10) // 右上
        let {r: r3, g: g3, b: b3} = getRGB(pixels, 10, height - 10) // 左下
        let {r: r4, g: g4, b: b4} = getRGB(pixels, width - 10, height - 10) // 右下
        let {r: r5, g: g5, b: b5} = getRGB(pixels, width / 4, height - 10) // 下3
        let {r: r6, g: g6, b: b6} = getRGB(pixels, width * 3 / 4, height - 10) // 下4
        // 取背景色时,左下或右下可能会被跳台遮挡,因此下部取四个颜色
        if (!isSimilar(r3, g3, b3, r4, g4, b4)) {
            if (isSimilar(r3, g3, b3, r5, g5, b5)) {
                r4 = r5
                g4 = g5
                b4 = b5
            } else if (isSimilar(r3, g3, b3, r6, g6, b6)) {
                r4 = r6
                g4 = g6
                b4 = b6
            } else if (isSimilar(r4, g4, b4, r5, g5, b5)) {
                r3 = r5
                g3 = g5
                b3 = b5
            } else {
                r3 = r6
                g3 = g6
                b3 = b6
            }
        }
        redMax = Math.max(r1, r2, r3, r4)
        redMin = Math.min(r1, r2, r3, r4)
        greenMax = Math.max(g1, g2, g3, g4)
        greenMin = Math.min(g1, g2, g3, g4)
        blueMax = Math.max(b1, b2, b3, b4)
        blueMin = Math.min(b1, b2, b3, b4)
        // 从图片左上角由左到右,由上到下扫描图片,先找出小黑人坐标
        console.log(`正在扫描图片,计算小黑人底部坐标...`)
        let blackPoint // 记录最终确定的小黑坐标
        // y轴方向上下分别减少350px,x轴方向左右分别减少100px,以防止游戏内文字等其他因素影响色块判断
        for (let i = 350; i < height - 350; i++) {
            for (let j = 100; j < width - 100; j++) {
                let px = getRGB(pixels, j, i)
                // 当此色块不属于背景色时,开始分析
                if (!isBg(px.r, px.g, px.b)) {
                    // 当blackPoint不存在或扫描到的色块y值大于已记录值,则记录该点
                    if ((!blackPoint || blackPoint.y < i) && isBlack(px)) {
                        blackPoint = {
                            x: j,
                            y: i
                        }
                    }
                }
            }
        }
        if (blackPoint) {
            // 小黑点坐标修正值
            blackPoint.x += 7
            blackPoint.y -= 15
            console.log(`小黑坐标为：x:${blackPoint.x},y:${blackPoint.y}`)
            // 如果找到小黑点，则开始分析目标点坐标
            console.log(`正在分析目标点坐标...`)
            // 记录目标平台的顶点坐标,然后根据顶点坐标估算出下方的目标点坐标
            // 此算法非最优,计算结果不够精确,待优化
            let target
            // 从左上角开始,由上向下,由左到右依次扫描
            for (let i = 100; i < width - 100; i++) {
                for (let j = 350; j < height - 350; j++) {
                    let px = getRGB(pixels, i, j)
                    // 当此色块不属于背景色且非疑似小黑时,记录该点
                    if (!isBg(px.r, px.g, px.b) && !isBlack2(px)) {
                        if (!target || target.y > j) {
                            target = {
                                x: i,
                                y: j
                            }
                            break
                        }
                    }
                    // 如果扫描到第一个疑似小黑的点,则结束当前y坐标循环
                    if (isBlack2(px)) {
                        break
                    }
                }
            }
            if (target) {
                // 根据目标点与小黑的距离对目的坐标进行修正
                if (target.x > blackPoint.x) {
                    target.y += 25
                    target.x -= 5
                } else {
                    target.y += 25
                    target.x += 5
                }
                console.log(`目标点坐标为：x:${target.x},y:${target.y}`)
                return {target, blackPoint}
            } else {
                console.log(`未获取到目标点`)
            }
        } else {
            console.log(`未获取到小黑坐标点`)
        }
    } catch (err) {
        console.error(err)
    }
}

// 执行起跳命令
function jump(width, height, press_time) {
    // 模拟Android点击屏幕命令
    let cmd = `adb shell input swipe ${width} ${height} ${width} ${height} ${press_time}`
    shell.exec(cmd)
}

function auto() {
    console.log('获取屏幕截图...')
    screenShot()
    setTimeout(() => {
        getPosition().then((res) => {
            if (res) {
                // 距离时间系数：按压时间 = 两点距离 * 系数
                // 系数越大,跳的越远
                const k = 1.3082
                // 计算起点与目标点的距离
                const instance = Math.sqrt(Math.pow(res.target.x - res.blackPoint.x, 2) + Math.pow(res.target.y - res.blackPoint.y, 2))
                const press_time = instance * k
                // 随机点按压,避开微信的防外挂检测
                console.log('开始起跳...')
                jump(random(500, 700), random(700, 1000), parseInt(press_time))
                // 随机停顿,也是为了避开微信的防外挂检测
                console.log('等待中...')
                setTimeout(auto, random(500, 1200))
            }
        })
    }, 800)
}

auto()