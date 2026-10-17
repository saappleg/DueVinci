# 3D anatomy model attribution

**Required credit:** BodyParts3D © The Database Center for Life Science, licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

The anatomy meshes and structure metadata bundled with DueVinci were prepared by [Human Atlas](https://github.com/ashemag/human-atlas/tree/1c38bf35c254a891200d3cedecfd57abebe83d8d) from BodyParts3D 4.0. The pinned source snapshot is commit `1c38bf35c254a891200d3cedecfd57abebe83d8d`; its model files are in [`public/models`](https://github.com/ashemag/human-atlas/tree/1c38bf35c254a891200d3cedecfd57abebe83d8d/public/models), and the preparation notes are in [`public/ATTRIBUTION.md`](https://github.com/ashemag/human-atlas/blob/1c38bf35c254a891200d3cedecfd57abebe83d8d/public/ATTRIBUTION.md).

Human Atlas documents these data adaptations: converting source axes and units, simplifying meshes for browser use, quantizing normals, and packing the geometry into compressed chunks. DueVinci redistributes those prepared model files locally and rewrites the manifest chunk paths for this repository. The geometry and structure data are otherwise unchanged.

BodyParts3D is an adult male reference anatomy. It does not show every human structure or individual variation. The Anatomy Studio is educational and is not a clinical tool.

The local renderer library is Three.js, Copyright © 2010–2026 Three.js Authors, under the [MIT License](../../assets/vendor/three/LICENSE). DueVinci does not bundle Human Atlas application code.

Official BodyParts3D license and dataset:

- [BodyParts3D license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)
- [BodyParts3D data archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)
- [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode)
