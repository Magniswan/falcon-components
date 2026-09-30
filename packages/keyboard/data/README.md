# 离线词库

来源为 [rime/rime-pinyin-simp](https://github.com/rime/rime-pinyin-simp)，固定提交 `0c6861ef7420ee780270ca6d993d18d4101049d0`。上游 AUTHORS 说明词库源自 Android Pinyin IME，使用 Apache-2.0。原始数据、LICENSE 和 AUTHORS 保留在此，完整来源、哈希和转换方法见 [provenance.json](provenance.json)。

`lexicon.js` 是生成的源代码数据文件，包含全部 65,125 条记录、预计算的全拼与九宫格排序索引。使用 `node scripts/build-keyboard-lexicon.mjs` 从原始 YAML 重建；不需要联网。排序只是数据转换，不包含 Rime 引擎代码。拼音引擎本身为本仓库原创 MIT 代码。

字词数据保持上游原样，少量生僻字是否可显示取决于宿主固件字体。第一版只做字词匹配和词频排序，没有整句解码或个人词频学习。
