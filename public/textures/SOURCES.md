# Texture sources

All textures are NASA (or NASA/USGS) imagery in the public domain. NASA imagery is generally not
copyrighted and may be used without permission; credit is given below and on the in-game Data
Sources screen. No endorsement by NASA is implied (NASA media guidelines:
https://www.nasa.gov/nasa-brand-center/images-and-media/). Downloaded 2026-10-22 and resized with
sharp 0.34 (Lanczos3, mozjpeg, progressive JPEG). Originals are not kept in the repo.

| File | Size | Original file | Original resolution | Licence / credit |
|---|---|---|---|---|
| `earth_bluemarble_4k.jpg` | 4096×2048, 1.12 MB, q88 | https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg (Blue Marble Next Generation, December 2004, topography + bathymetry; page https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) | 5400×2700 equirectangular, 2.57 MB | Public domain. Credit: NASA Earth Observatory. |
| `mars_viking_4k.jpg` | 4096×2048, 1.78 MB, q88 | https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/5ea881c6-01b3-41fa-a7af-42d2131b54f1/download/mars_viking_mdim21_clrmosaic_1km.jpg (Mars Viking MDIM 2.1 colorized global mosaic; page https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m) | 21339×10670 equirectangular (1 km/px), 36.7 MB | USGS: “Access Constraints: public domain; Use Constraints: none”. Credit: NASA/JPL/USGS. Longitude −180° (left edge) to +180°, 0° at the centre. |
| `starmap_8k.jpg` | 8192×4096, 2.90 MB, q82 | https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003895/starmap_8k.jpg (Deep Star Maps, SVS 3895; page https://svs.gsfc.nasa.gov/3895) | 8192×4096 plate carrée, J2000 RA/Dec, 7.2 MB | Public domain. Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio. Re-encoded only (no resize); the 4096-px version looked soft on a full-screen sky sphere, so the 8k map is kept (allowed by the task ruling). |
| `sun_sdo_aia171_2k.jpg` | 2048×2048, 0.44 MB, q88 | https://sdo.gsfc.nasa.gov/assets/img/latest/latest_4096_0171.jpg (SDO/AIA 171 Å, image time 2026-10-23 00:36:46 UT; that URL always serves the newest image) | 4096×4096 full-disk image (not a sphere map), 2.56 MB | Public domain. Credit: NASA/SDO and the AIA, EVE, and HMI science teams. The burned-in caption strip (bottom 96 px after resizing) was painted black. |

To re-create: download the original files above into an empty folder and resize to the sizes
listed (e.g. with `npx sharp-cli` or a short Node script using `sharp`; sharp is not a project
dependency).
