# 图片资源说明

请将以下图片资源放入 `images` 目录：

## 必需的图片资源

### 1. logo.png
- **尺寸**: 512x512px
- **用途**: 登录页面的应用logo
- **格式**: PNG (支持透明背景)

### 2. fund.png
- **尺寸**: 81x81px
- **用途**: 底部导航栏"基金"图标（未选中状态）
- **格式**: PNG
- **建议**: 使用浅色图标

### 3. fund-active.png
- **尺寸**: 81x81px  
- **用途**: 底部导航栏"基金"图标（选中状态）
- **格式**: PNG
- **建议**: 使用深色或彩色图标

### 4. user.png
- **尺寸**: 81x81px
- **用途**: 底部导航栏"我的"图标（未选中状态）
- **格式**: PNG
- **建议**: 使用浅色图标

### 5. user-active.png
- **尺寸**: 81x81px
- **用途**: 底部导航栏"我的"图标（选中状态）
- **格式**: PNG
- **建议**: 使用深色或彩色图标

### 6. user-default.png
- **尺寸**: 200x200px
- **用途**: 未登录时的默认用户头像
- **格式**: PNG
- **建议**: 使用通用的用户头像图标

## 图标设计建议

### 颜色方案
- 主色: #667eea (紫蓝色)
- 辅色: #764ba2 (紫色)
- 未选中: #999999 (灰色)
- 背景: 白色或透明

### 设计风格
- 简洁扁平化
- 圆角设计
- 与玻璃拟态风格搭配

## 快速生成图标

### 方法1: 使用在线工具
- [Iconfont](https://www.iconfont.cn/) - 阿里巴巴图标库
- [IconPark](https://iconpark.oceanengine.com/) - 字节跳动图标库
- [Flaticon](https://www.flaticon.com/) - 国际图标库

### 方法2: 使用设计工具
- Figma
- Sketch  
- Adobe XD
- Canva

### 方法3: 使用 Emoji 临时替代
如果暂时没有图标，可以使用 emoji 或纯色方块作为占位符：

```javascript
// 临时方案：使用纯色背景 + 文字
// 在 app.json 中注释掉 tabBar 的 iconPath
"tabBar": {
  "list": [
    {
      "pagePath": "pages/index/index",
      "text": "基金"
      // "iconPath": "images/fund.png",
      // "selectedIconPath": "images/fund-active.png"
    }
  ]
}
```

## 注意事项

1. 所有图标必须是 PNG 格式
2. 图标大小不要超过 40kb
3. tabBar 图标建议使用 81x81px
4. 建议使用 @2x 和 @3x 规格适配不同屏幕
5. 透明背景的图标效果更好

---

完成图片资源添加后，请更新 app.json 中的路径配置。
