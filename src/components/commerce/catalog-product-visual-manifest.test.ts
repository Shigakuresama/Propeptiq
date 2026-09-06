import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";

import {
  catalogProductFrontVisuals,
  catalogProductVisualManifest,
  getCatalogProductVisualScenes,
  getCatalogVisualIdentity,
} from "./catalog-product-visual-manifest";

const expectedVisuals = [
  [
    "front",
    "Front",
    "/catalog/visual-masters/front.webp",
    "5164763c33c82d3db31a3fdf63fa248931c3843e823f65164a5924ff0fb525b3",
  ],
  [
    "three-quarter",
    "Three-quarter",
    "/catalog/visual-masters/three-quarter.webp",
    "7a06992f37dfbaca9f5c501615caadd7b49581607bed73556625e04d53d50a05",
  ],
  [
    "multi-vial-study",
    "Multi-vial study",
    "/catalog/visual-masters/multi-vial-study.webp",
    "864f0f27bdbef52fdbdf095957be182b2b684909c4a7bda7c8fe3a9daf376be8",
  ],
  [
    "copy-space-detail",
    "Copy-space detail",
    "/catalog/visual-masters/copy-space-detail.webp",
    "72194dd2ebf65008729c867c9f59082255d06bde5849f79a052bc41f67b98218",
  ],
  [
    "overhead",
    "Overhead",
    "/catalog/visual-masters/overhead.webp",
    "9e904bb1f308c6153992d739bf46e2541d6b116bfb900f81594715f7711ad6f5",
  ],
  [
    "ambient-studio",
    "Ambient studio",
    "/catalog/visual-masters/ambient-studio.webp",
    "82e27fd60008638b48c0c6aad0f9471eac8c1ff583af764dd82610013e9d407f",
  ],
] as const;

const expectedCanonicalProductSlugs = [
  "5-amino-1mq",
  "acetic-acid",
  "admax",
  "aod-9604",
  "ara-290",
  "bac-water",
  "bpc-157",
  "bpc-tb-blend",
  "bpc-tb-blend-bb20",
  "bpc-tb-blend-bb40",
  "cargrilintide",
  "cartalax",
  "cjc-1295-no-dac",
  "cjc-1295-no-dac-ipa",
  "cjc-1295-no-dac-ipa-cp20",
  "cjc-1295-with-dac",
  "dsip",
  "epithalon",
  "ghk-cu",
  "glow",
  "glutathione",
  "grp-2",
  "hcg",
  "hgh",
  "igf-1-lr3",
  "ipamorelin",
  "kisspeptin",
  "klow",
  "kpv",
  "lemon-bottle",
  "li-po-c",
  "li-po-c-without-b12",
  "ll37",
  "mots-c",
  "mt1",
  "mt2",
  "nad-plus",
  "oxytocin-acetate",
  "pe-22-28",
  "pinealon",
  "pt-141",
  "retatrutide",
  "selank",
  "semaglutide",
  "semax",
  "semax-selank",
  "sermorelin-acetate",
  "snap",
  "ss-31",
  "survodutide",
  "tb500",
  "tesmorelin",
  "tesmorelin-ipa",
  "thymosin-alpha-1",
  "tirzepatide",
  "vip",
] as const;

const originalProductFronts = {
  "bpc-157": [
    "2bf1318c4c1dbc4ecc178489cc44ea7e47f259977e2eb4106eb0454842cd2a8b",
    "14962877a70be6667b17ca843100f99ccf2d3a88f89a0c595e66422969679893",
  ],
  tirzepatide: [
    "4cd6b2c1bb22846c7dd9d6e972f2d852b1c162781cc24fb550a3d1c17362bbbb",
    "236f9248340369ab8c898e3c98cee5b61ec15d3de0d50dc06fd37e775dbf4b51",
  ],
  retatrutide: [
    "f76a0b28116d2b928e62aee9c7cef8664e0186606c8b542d1993541b952160db",
    "498bb5fcada2c34b94bd6cd0078f44606d03f5652211648a47eb68e70db9ac38",
  ],
  "nad-plus": [
    "8d9dc1a7f75871ec57fe3a25f1db30f03912ccf63c7c8844e3dd9e6292c812d0",
    "4d5669cc0200b78347a6f85d244f26e3175a51293d23282c9f500e5824dc47b8",
  ],
  semax: [
    "852571841f2bdc7384ef454d5272b82fbe4144851e94ea1e8b02f5dfbbd7645b",
    "e845ad20ac9843bd030a2ab83b0b78e39ecd910655852ecc1f6d4832882d580e",
  ],
  selank: [
    "abf3280ab817845ee3df65c3fbd800ce9701763d0ed7fa9e193d12f509ebceb7",
    "8749b8e5d79a72e43e25d5b95270c59f4cf961039d3f346dca7bcff28b47ed85",
  ],
} as const;

const alternateProductSlugs = [
  "bpc-157",
  "tirzepatide",
  "retatrutide",
  "nad-plus",
  "semax",
  "selank",
  "hgh",
  "ghk-cu",
  "tesmorelin",
  "tesmorelin-ipa",
  "tb500",
  "bpc-tb-blend",
] as const;
const alternateSceneIds = [
  "three-quarter",
  "multi-vial-study",
  "copy-space-detail",
  "overhead",
  "ambient-studio",
] as const;

const secondAlternateBatchSources = [
  ["hgh", ["/catalog/individual/hgh/three-quarter-v1.webp", "/catalog/individual/hgh/multi-vial-study-v1.webp", "/catalog/individual/hgh/copy-space-detail-v1.webp", "/catalog/individual/hgh/overhead-v1.webp", "/catalog/individual/hgh/ambient-studio-v1.webp"]],
  ["ghk-cu", ["/catalog/individual/ghk-cu/three-quarter-v1.webp", "/catalog/individual/ghk-cu/multi-vial-study-v1.webp", "/catalog/individual/ghk-cu/copy-space-detail-v1.webp", "/catalog/individual/ghk-cu/overhead-v1.webp", "/catalog/individual/ghk-cu/ambient-studio-v1.webp"]],
  ["tesmorelin", ["/catalog/individual/tesmorelin/three-quarter-v1.webp", "/catalog/individual/tesmorelin/multi-vial-study-v1.webp", "/catalog/individual/tesmorelin/copy-space-detail-v1.webp", "/catalog/individual/tesmorelin/overhead-v1.webp", "/catalog/individual/tesmorelin/ambient-studio-v1.webp"]],
  ["tesmorelin-ipa", ["/catalog/individual/tesmorelin-ipa/three-quarter-v1.webp", "/catalog/individual/tesmorelin-ipa/multi-vial-study-v1.webp", "/catalog/individual/tesmorelin-ipa/copy-space-detail-v1.webp", "/catalog/individual/tesmorelin-ipa/overhead-v1.webp", "/catalog/individual/tesmorelin-ipa/ambient-studio-v1.webp"]],
  ["tb500", ["/catalog/individual/tb500/three-quarter-v1.webp", "/catalog/individual/tb500/multi-vial-study-v1.webp", "/catalog/individual/tb500/copy-space-detail-v1.webp", "/catalog/individual/tb500/overhead-v1.webp", "/catalog/individual/tb500/ambient-studio-v1.webp"]],
  ["bpc-tb-blend", ["/catalog/individual/bpc-tb-blend/three-quarter-v1.webp", "/catalog/individual/bpc-tb-blend/multi-vial-study-v1.webp", "/catalog/individual/bpc-tb-blend/copy-space-detail-v1.webp", "/catalog/individual/bpc-tb-blend/overhead-v1.webp", "/catalog/individual/bpc-tb-blend/ambient-studio-v1.webp"]],
] as const;

const expectedAlternateAssets = [
  ["bpc-157", "three-quarter", "/catalog/individual/bpc-157/three-quarter-v1.webp", "80bbed05f7483e35d63ce9dd88e46c2607003b7dccf4daab169a151eed45bcb8", "16ac54de8690cc9c723f14d439048bcd6ed85d06683709d130543c89dcae970e", 50812],
  ["bpc-157", "multi-vial-study", "/catalog/individual/bpc-157/multi-vial-study-v1.webp", "833d0c2d07f8dbc26af6cdef2529aaa6af154662187ce45a02257c38811af65c", "34a4a4b71cbb858008aadf7d7e7c03476f31ea843cefc68e7409000278acb003", 52370],
  ["bpc-157", "copy-space-detail", "/catalog/individual/bpc-157/copy-space-detail-v1.webp", "030078125785a7a917e87281899fd62e913aa87aae7713047e4567696ce37064", "db8367ce4190320b18518d235c8a8fd6c7bdbf354bae2481e3a0bde78ab80650", 31270],
  ["bpc-157", "overhead", "/catalog/individual/bpc-157/overhead-v1.webp", "09008ce87bb9e806129c31dcf1b75870d4b416d308f5204b5030e14e447566b2", "3b6212949c0daaeb1e574bb7082256a0aba9ec1cfba26f8823961a60fec18b69", 47324],
  ["bpc-157", "ambient-studio", "/catalog/individual/bpc-157/ambient-studio-v1.webp", "0827d04ceb0ced5e4ad17f1279fdf3c92f2f8ab0b0150a26f83f337cdfbe8bd2", "52780ad0b5fb8122bf8fb5c83a6ddf453f9d6c69a96f36a8401fb628e1e7a0c5", 50286],
  ["tirzepatide", "three-quarter", "/catalog/individual/tirzepatide/three-quarter-v1.webp", "ec5dfe448fc24a76de6ef4c12ba569b8a488e757bda0f39dc723848a64f6040d", "af0e761bd31ee3d53150644758a985f465bfa908cd12cda7013454c399595d3b", 49572],
  ["tirzepatide", "multi-vial-study", "/catalog/individual/tirzepatide/multi-vial-study-v1.webp", "7403fbd967b549a5b01ec828ec5e0cad26c3c69800f06a8c620d3e1d27603daa", "d5144530a355b93548bd26c77949157e0f7aeea0e2b8b69c451d9916eaf172db", 54712],
  ["tirzepatide", "copy-space-detail", "/catalog/individual/tirzepatide/copy-space-detail-v1.webp", "95cb21fa36c89e852f3e538cbbe34e6482eb94c6d7f512c97a2b5dad1a57aca1", "4f743657078ed3da22516cb2e338ee08ba11ecd09f0e7b7f3caa4a27539aa885", 32462],
  ["tirzepatide", "overhead", "/catalog/individual/tirzepatide/overhead-v1.webp", "666b339ddf72dfe8fc0354a491b8b3dad7782f5448afd6667a408cfc6e99492a", "9dbcc1f70d9fca89cc4c12365289fa01efd566f5a093b5681ea538b4326becce", 44962],
  ["tirzepatide", "ambient-studio", "/catalog/individual/tirzepatide/ambient-studio-v1.webp", "d61497fe7a11ba4cf62da804337a9b00a0e45b1a45845dd935f5ae33dd215744", "25f89ff909494ceb48611f75a27cd077bc93ae14e7babde90a022023899c3e87", 50258],
  ["retatrutide", "three-quarter", "/catalog/individual/retatrutide/three-quarter-v1.webp", "8629e93aed48a9a3d5ca168e03b132d3eec73a8915fda8a356c3f2f576a6b499", "a66dd47902ad696f2d9eadf0377dba788e875f6607eccf80d3ac65fa95822095", 49896],
  ["retatrutide", "multi-vial-study", "/catalog/individual/retatrutide/multi-vial-study-v1.webp", "a86ae49e5d42c6933852e0689a18a14172145d65de344922ae503359d98294b4", "da7550d7a75ca88831ebab9a5ee2210d6e5295ea1b09c960c1510a8e1ec9b70f", 55624],
  ["retatrutide", "copy-space-detail", "/catalog/individual/retatrutide/copy-space-detail-v1.webp", "6c8e09c4eb62c731c60cab7bbdd9fd8e143f80014ae1de9686c69fb745186ad9", "c066184519abbc12167e08cee0f9c157309cda9d23ff17bba2fe5e73d1eb5883", 33636],
  ["retatrutide", "overhead", "/catalog/individual/retatrutide/overhead-v1.webp", "955cf4d588b76f51bb21b858d5980c49dda9e27b6cf89cef64b6ae16a0dca28e", "1a55529a0a3a29e9970fc2ea98f9523f0d5317c91199dc5f29b695b78846e1d2", 45440],
  ["retatrutide", "ambient-studio", "/catalog/individual/retatrutide/ambient-studio-v1.webp", "055cf3e2204e16dfa81c417ff0ca6a91d87cfe5227935a28db21f8d313893757", "08a8dd0d7739f5fc907b96069904dbe1e3a94abbc425c5582f9be49ee0697f8f", 51406],
  ["nad-plus", "three-quarter", "/catalog/individual/nad-plus/three-quarter-v1.webp", "788fe63bd49c8121e49b4cc92ce57cfbd053a851726cfad5ddc85c390ccbfdfc", "57540642d052ae9af9bd3616e53c5fa1f8b1d95e28bb0b9cbeeaa0f758a8aa6b", 49552],
  ["nad-plus", "multi-vial-study", "/catalog/individual/nad-plus/multi-vial-study-v1.webp", "38412355002807e80b88ad6388a6744a397adf300b9bcef11d4e115ce3f5aa9c", "410e72fa93e65b51504b71a2c64f8370e1fdc7cd361ea7f8123be5973ef0ab54", 52094],
  ["nad-plus", "copy-space-detail", "/catalog/individual/nad-plus/copy-space-detail-v1.webp", "fe99f3b17156af1d7552494281fd9156192c4a399fb530cb5d01878b3cd8278a", "3f1aec7262fe1e33cd6ef7ba6f8c1f3f1af2fb472f45277c6b3feb374615b3dc", 30564],
  ["nad-plus", "overhead", "/catalog/individual/nad-plus/overhead-v1.webp", "8b8af8970a3a3ef6883258e96cec091b9e7af3694d8364dadfc6f0d522e0ee31", "01299ba9b6de5d5288ae6f841846b5fda68ed54cf758a5d51c92e866148447b7", 42258],
  ["nad-plus", "ambient-studio", "/catalog/individual/nad-plus/ambient-studio-v1.webp", "34a9de8d5ac469a54e58eadf41f977839846e70d911ab1610e08151b1bc4ed58", "f0818bb5e4960997da4a2598db97077a3b5d734fd8880ee132206f861290efee", 47504],
  ["semax", "three-quarter", "/catalog/individual/semax/three-quarter-v1.webp", "a7536edea9efc21e6a67724a28c7e0997e81d9e1b6fa175985a4bf135dd6454b", "0850a79420a9b64e055f7db30a47bd8adc6c2b494443958b66b77e11c3c1ae8d", 50036],
  ["semax", "multi-vial-study", "/catalog/individual/semax/multi-vial-study-v1.webp", "f03f9b09bb1ec64307ce55eee39e7740814b8c7fc0dfad3145a032d8af93e64f", "0e974cd9a0e947abc8744f3d8de23454ad116c30167c5c3f2274d0fa3cb36e82", 54600],
  ["semax", "copy-space-detail", "/catalog/individual/semax/copy-space-detail-v1.webp", "1c6009c7aff7d55dbe22bc16aa9b784d33f2ef962dbf98d0f36fa41db9328cb7", "c73a29229320e9eb915b4d9caf3dcb1f9d6a7d2bab841cfd771cdf913069573c", 31566],
  ["semax", "overhead", "/catalog/individual/semax/overhead-v1.webp", "6a5d97ae65099c1cc45d9878cce0823b40ebca3f8c6938679dc3dfa8b1aa0ecb", "6fab9a372d80728908d85c9a994e34e915f3da75b7f40635b3e71fff90dbac08", 43896],
  ["semax", "ambient-studio", "/catalog/individual/semax/ambient-studio-v1.webp", "d4ea3d4ff14c9014ec294d34ddd501e8a4bb3fd081c9bec769147bac7dec495c", "d0b02c17adf4f596a3d5766776856d564758f808046901a54c0df9a292f6837e", 50712],
  ["selank", "three-quarter", "/catalog/individual/selank/three-quarter-v1.webp", "5f31705c2691ea68994e64d13c78f89ba73e8f64c2cfa4a1e5703fefa0625cf5", "fc341029cb3a928672431259c1fdcce2ef0316e29eb4c29afc3a5c379ff47fc1", 46320],
  ["selank", "multi-vial-study", "/catalog/individual/selank/multi-vial-study-v1.webp", "86de0ca20a0b1f362b513775d0ec2b2a1527b10a363ee335c225d4de254aa361", "e153a8043b5b59de0593a43511c9466067f48fa9740c38497e6ac780a51a9dd6", 53900],
  ["selank", "copy-space-detail", "/catalog/individual/selank/copy-space-detail-v1.webp", "81c38103886b4d629b0c4ec33431379c910013a171f2daf01e3f12ef9f9d63a9", "8c2b6ca3755f262054f742ba94553d6782b2afd5d03572232ebe51f1a5100b6d", 31922],
  ["selank", "overhead", "/catalog/individual/selank/overhead-v1.webp", "939bbc621c64da24e9b19860ca2fe0e49d49102483648cff4982441cbce1435d", "216e525da72140545052675f546a62c648b9a53dbcfc6cfaf805e33130285647", 44816],
  ["selank", "ambient-studio", "/catalog/individual/selank/ambient-studio-v1.webp", "01df3372d2b0cb74389cb16e13c15d8c99d0a6a0e412aacd2b2695d414034807", "455285ae7323625c169099be842efe2b66149de7db67ad99180cb2039d5fedf0", 52278],
  ["hgh", "three-quarter", "/catalog/individual/hgh/three-quarter-v1.webp", "baf8f96e5f9f7d76c2d5e72754b6de5b5d7fc1aaafed3167f7f6df6e11b18342", "a8bfb8222f8cbb345f6ce4a226b1f82363437ba885555e4a1b6540920b2fc303", 42368],
  ["hgh", "multi-vial-study", "/catalog/individual/hgh/multi-vial-study-v1.webp", "e73fb8fed5b2c0c633fb131823a25fb6233b7fd123dbf67a48f591c54e29cbdb", "a1988d91013c33eee7913340ea3bb77da16fc0987d39398af3046e6f9e270937", 50616],
  ["hgh", "copy-space-detail", "/catalog/individual/hgh/copy-space-detail-v1.webp", "d7e8c387c41788a743a3a861a84a562024fe1674638ad2b1cf2082e6a5b905bb", "db0f42dbfd3e131060dcab183f5d11dd7bc7fe380bf15f962c07df822c087944", 26920],
  ["hgh", "overhead", "/catalog/individual/hgh/overhead-v1.webp", "a20488cfea299aae7061fc3e13b1df0674ce52627d5ae6303dfd33b9f1226114", "a80664c1ca0ca42121d21d9de00847ef687d0e7a70fb4e415d61d799b7c95ab7", 53952],
  ["hgh", "ambient-studio", "/catalog/individual/hgh/ambient-studio-v1.webp", "ae7d633991adb90b8e75138263de438cd89e973af5fe455365097d62017765be", "cb95b56752881295cfcdffc028b3364d88d4be01e5b40e4de9ce224f0d79fa2f", 49340],
  ["ghk-cu", "three-quarter", "/catalog/individual/ghk-cu/three-quarter-v1.webp", "04bcd0565374d04cf4853d2be00c1ad7d78323a9422b7d75a6ce4f05ce538c6e", "2c994d4ab661f7a7d738368724758e1ee782e0819e3557666604f7910447f027", 37614],
  ["ghk-cu", "multi-vial-study", "/catalog/individual/ghk-cu/multi-vial-study-v1.webp", "061310921879ec5007b58ab3e1f7c9544b015eded840cf9546d6a8d14a9da7cb", "584e69770f7ef8bf5e8cf7c82b2d223f6ca0e927ea69156bdf4f5f3fcb401833", 54982],
  ["ghk-cu", "copy-space-detail", "/catalog/individual/ghk-cu/copy-space-detail-v1.webp", "abc8f01b1560da50c07db3255c4f761d59ac997b3f70a87681924c1192f65a40", "c8bdcf95614b131d9c5932cf3cda0d7a0ad722b6b7293f72c13e303c1ae205e6", 28886],
  ["ghk-cu", "overhead", "/catalog/individual/ghk-cu/overhead-v1.webp", "533215f8d133f7a1a78fe3c2e75d4868d7079c9d6f53638cab9d9470926fb4fd", "e1a6456f69ecdc6b2bfd56b83661e2d42ecc8726ee88db622be2f0f085ce1819", 47884],
  ["ghk-cu", "ambient-studio", "/catalog/individual/ghk-cu/ambient-studio-v1.webp", "8056d62cbc66363424446442fb75a4b35d6e5ca36d91cf776d0d10b033420510", "bddb674422df366c14697c9fd0400225ef50199d8c78dd94677638badd350441", 53336],
  ["tesmorelin", "three-quarter", "/catalog/individual/tesmorelin/three-quarter-v1.webp", "881c481a7e36def7a7a83e4a008608c000b45f6565d38ad55507055ee85425cd", "eda37af974be1aa17cad13b2890d317f27c33e2e477ef15661134f2565e3ef48", 46730],
  ["tesmorelin", "multi-vial-study", "/catalog/individual/tesmorelin/multi-vial-study-v1.webp", "3f7f0498b407cc7d04bbd19b2c45fffe3d15ddf60496f27e594c35f88a5aa701", "a9e0052e2462377731d2293ec4efb3fe4cb068e85346f0c2651228bf8e4f1eac", 58242],
  ["tesmorelin", "copy-space-detail", "/catalog/individual/tesmorelin/copy-space-detail-v1.webp", "42d79a63f65d7992d56015d53473412e95a9613d91270edbc6bbbbd6e5cf8b67", "bcbbf6f09c0e101ea9a45fc2131a39d3e817c20fb6e45eade31aabd6f2ecd577", 33416],
  ["tesmorelin", "overhead", "/catalog/individual/tesmorelin/overhead-v1.webp", "08445af6a1813abaf4f552eaf1a62aabdd952636312344ea96ca3b927dbaf908", "3167e83bba92fb0e3283de3b9d1ff2e5ee353f1570198e44fdc04287352a6f79", 52004],
  ["tesmorelin", "ambient-studio", "/catalog/individual/tesmorelin/ambient-studio-v1.webp", "d9b115f7bc84bf726c7c50f18d464d773e3299750463d87deeea5c040c77c9b8", "4d7fcbe846e5e7e110838a634f6e0fb34cf7164e71322d4b495c6a0116435bde", 55132],
  ["tesmorelin-ipa", "three-quarter", "/catalog/individual/tesmorelin-ipa/three-quarter-v1.webp", "4b5aee65039c819c9ae431c7ff38a92210dc308b750c19f0d832081b4837389d", "6ca4b9f11782e97f740fec416cd5af301b42f5022f390c3bc105743a74253a2a", 45928],
  ["tesmorelin-ipa", "multi-vial-study", "/catalog/individual/tesmorelin-ipa/multi-vial-study-v1.webp", "79809c7d692a542ef46624877fc1ad3b2c3539e8fc4d8f5834b63efbd2a74687", "f7ae993c825d344b37b1df75b073285408ce9ebf11415ebad3666ff922c371a1", 65230],
  ["tesmorelin-ipa", "copy-space-detail", "/catalog/individual/tesmorelin-ipa/copy-space-detail-v1.webp", "746c8204a25f922fc825a02e31b071d4cecdd062f83c4ed9e5ce796180078b8f", "2588d15be2473204598146937317434f1ef5c17103b62f863b8ebbba19d4dda6", 33850],
  ["tesmorelin-ipa", "overhead", "/catalog/individual/tesmorelin-ipa/overhead-v1.webp", "c845232b99630dcfcafb88fe4265958350aad4eda5e095d5a0216e5157886f0a", "24a733dd008325c92885348f8375b38faf44e0dda06e5540a634dd9b575f7d3d", 55986],
  ["tesmorelin-ipa", "ambient-studio", "/catalog/individual/tesmorelin-ipa/ambient-studio-v1.webp", "5105e44c927eac4e65b95c635c204bdcbc835bfb44d4b341a88344683edb3b09", "1e98476a49467e5de787ecbd1c6b69e3ed8a2ff195303e52d7e4873c60cf42db", 63514],
  ["tb500", "three-quarter", "/catalog/individual/tb500/three-quarter-v1.webp", "0b1788aac0bd337089692e7b282bd3d9d71db640f9c1cebc7d871efa8e5117af", "f34639d987a05a244e8a3f5b62b34fc3e3f248661c5fc478f4e1cd306233d814", 48390],
  ["tb500", "multi-vial-study", "/catalog/individual/tb500/multi-vial-study-v1.webp", "4e7ea3d61740178ba614471e6acdff9546782cc62eaa06bcb2e9f5104b4cd1e1", "c632285a37ffc3a963f2ee41eb42ec824d1a5c7ece494ee9909a7189e4dc86e4", 72106],
  ["tb500", "copy-space-detail", "/catalog/individual/tb500/copy-space-detail-v1.webp", "bfcb688f1060bd6cc892e3e2fad91aef735b770394f076d0086f079772d9336d", "a2ebfaa0ddbdaf58a42feb0db0cc2a2d366926c710129cdf2f1d312482144e08", 36556],
  ["tb500", "overhead", "/catalog/individual/tb500/overhead-v1.webp", "26375c33a4b397a2ec3f819ddd3ed6978c5a14153e81e765ef73df03c628b594", "0026f5b72d1e706c8dd4fb793f8d14ff2b2af7e99c900e1faf55ee5bea78d776", 54226],
  ["tb500", "ambient-studio", "/catalog/individual/tb500/ambient-studio-v1.webp", "c035490ffb5598468d56a61eb0cfeea8d732b13d45470ee3d624a39f43b6d342", "1d5e3243f69ee39562e51ff79f652915c7654dac66832d8cf181bba975d23ea6", 55290],
  ["bpc-tb-blend", "three-quarter", "/catalog/individual/bpc-tb-blend/three-quarter-v1.webp", "37ff42875fb1ad2b45532b78ba26b81a5aa2eb7971e0f6cf4b0335527816306b", "22939028652f5583c8bfc4c3849bd9883ac0b8ef3ae1020ed92de6f8d69fd049", 48056],
  ["bpc-tb-blend", "multi-vial-study", "/catalog/individual/bpc-tb-blend/multi-vial-study-v1.webp", "ec04b4af60e17aab0977000de55ec4a425fef7536eef00619e1beffbea31b8e5", "c6624f2b4fb390ac3b191412e70700b250d5cf7c1a29df541a92f2372e15f893", 63296],
  ["bpc-tb-blend", "copy-space-detail", "/catalog/individual/bpc-tb-blend/copy-space-detail-v1.webp", "18436a0d26a8b9a2cbb4de0721811b02037074410392c4cf89a50188ebbba2ea", "c46d965683cb3c2706ae931f8e7e60be68af2c45fc9be39b7e567df37bec27bc", 34796],
  ["bpc-tb-blend", "overhead", "/catalog/individual/bpc-tb-blend/overhead-v1.webp", "cbac340447ccb99c160fbb04a137d95929ff4ac15ec1264a088e2f5dc69fb577", "92d36232b891d59d35aea0f06f36846a546903000006129a20cae29ea511ec2a", 58966],
  ["bpc-tb-blend", "ambient-studio", "/catalog/individual/bpc-tb-blend/ambient-studio-v1.webp", "57b4be942014131f217d9933733d38b619a3184762c96f8944cf259c4c65efbf", "2041b2cb51aab4aec410123c1145727cf4f61c91f37884a96da90793f01ffa86", 54588],
] as const;

describe("catalog product visual manifest", () => {
  it("resolves the second batch of six exact product-specific alternate source sets", () => {
    expect(secondAlternateBatchSources).toHaveLength(6);
    expect(new Set(secondAlternateBatchSources.flatMap(([, sources]) => sources))).toHaveLength(30);

    for (const [slug, expectedSources] of secondAlternateBatchSources) {
      const resolved = getCatalogProductVisualScenes(slug);
      expect(resolved).toHaveLength(6);
      expect(resolved[0]).toBe(catalogProductFrontVisuals[slug]);
      expect(resolved.slice(1).map(({ id }) => id)).toEqual([...alternateSceneIds]);
      expect(resolved.slice(1).map(({ src }) => src)).toEqual([...expectedSources]);
      expect(Object.isFrozen(resolved)).toBe(true);
      expect(getCatalogProductVisualScenes(slug)).toBe(resolved);
    }
  });

  it("resolves the exact 60 product-specific alternate assets while retaining 44 shared tails", async () => {
    expect(expectedAlternateAssets).toHaveLength(60);
    expect([...new Set(expectedAlternateAssets.map(([slug]) => slug))]).toEqual([...alternateProductSlugs]);
    expect(new Set(expectedAlternateAssets.map(([, , src]) => src))).toHaveLength(60);
    expect(new Set(expectedAlternateAssets.map(([, , , , outputSha256]) => outputSha256))).toHaveLength(60);

    for (const slug of alternateProductSlugs) {
      const expected = expectedAlternateAssets.filter(([assetSlug]) => assetSlug === slug);
      expect(expected.map(([, scene]) => scene)).toEqual([...alternateSceneIds]);
      const resolved = getCatalogProductVisualScenes(slug);
      expect(resolved[0]).toBe(catalogProductFrontVisuals[slug]);
      expect(resolved.slice(1).map(({ id }) => id)).toEqual([...alternateSceneIds]);
      expect(resolved.slice(1).map(({ src }) => src)).toEqual(
        alternateSceneIds.map((scene) => `/catalog/individual/${slug}/${scene}-v1.webp`),
      );
      expect(Object.isFrozen(resolved)).toBe(true);
      expect(getCatalogProductVisualScenes(slug)).toBe(resolved);

      for (const [index, [, expectedId, expectedSrc, inputSha256, outputSha256, expectedBytes]] of expected.entries()) {
        const scene = resolved[index + 1]!;
        expect(scene).toMatchObject({
          id: expectedId,
          src: expectedSrc,
          width: 1254,
          height: 1254,
          inputSha256,
          outputSha256,
        });
        expect(Object.isFrozen(scene)).toBe(true);
        const bytes = readFileSync(resolve(process.cwd(), `public${scene.src}`));
        expect(bytes).toHaveLength(expectedBytes);
        expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(outputSha256);
        expect(await sharp(bytes).metadata()).toMatchObject({
          format: "webp",
          width: 1254,
          height: 1254,
        });
      }
    }

    const sharedTailSlugs = expectedCanonicalProductSlugs.filter(
      (slug) => !alternateProductSlugs.includes(slug as (typeof alternateProductSlugs)[number]),
    );
    expect(sharedTailSlugs).toHaveLength(44);
    for (const slug of sharedTailSlugs) {
      expect(getCatalogProductVisualScenes(slug).slice(1)).toEqual(catalogProductVisualManifest.slice(1));
    }
  });

  it("resolves exact immutable fronts for all 56 canonical products without mutating the shared scene tail", async () => {
    const mappedSlugs = Object.keys(catalogProductFrontVisuals).sort();
    const expectedCatalogSlugs = storefrontCatalogData.products
      .map((product) => product.slug)
      .sort();
    const expectedMappedSources = Object.fromEntries(
      expectedCanonicalProductSlugs.map((slug) => [
        slug,
        `/catalog/individual/${slug}/front-v1.webp`,
      ]),
    );

    expect(mappedSlugs).toEqual([...expectedCanonicalProductSlugs]);
    expect(expectedCatalogSlugs).toEqual([...expectedCanonicalProductSlugs]);
    expect(new Set(Object.values(expectedMappedSources))).toHaveLength(56);
    expect(new Set(Object.values(catalogProductFrontVisuals).map((front) => front.src))).toHaveLength(56);
    expect(new Set(Object.values(catalogProductFrontVisuals).map((front) => front.outputSha256))).toHaveLength(56);
    expect(Object.isFrozen(catalogProductFrontVisuals)).toBe(true);
    for (const [slug, expectedSource] of Object.entries(expectedMappedSources)) {
      const resolved = getCatalogProductVisualScenes(slug);
      expect(resolved).toHaveLength(6);
      expect(resolved[0]).toMatchObject({ id: "front", src: expectedSource });
      if (!alternateProductSlugs.includes(slug as (typeof alternateProductSlugs)[number])) {
        expect(resolved.slice(1)).toEqual(catalogProductVisualManifest.slice(1));
      }
      expect(Object.isFrozen(resolved)).toBe(true);
      expect(Object.isFrozen(resolved[0])).toBe(true);
      expect(getCatalogProductVisualScenes(slug)).toEqual(resolved);
      expect(storefrontCatalogData.products.some((product) => product.slug === slug)).toBe(true);
      const bytes = readFileSync(resolve(process.cwd(), `public${expectedSource}`));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        resolved[0]!.outputSha256,
      );
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: "webp",
        width: resolved[0]!.width,
        height: resolved[0]!.height,
      });
    }

    for (const [slug, [inputSha256, outputSha256]] of Object.entries(originalProductFronts)) {
      expect(catalogProductFrontVisuals[slug]).toMatchObject({ inputSha256, outputSha256 });
    }

    const unmapped = getCatalogProductVisualScenes("fictional-unpublished-product");
    expect(unmapped).toBe(catalogProductVisualManifest);
    expect(getCatalogProductVisualScenes("constructor")).toBe(catalogProductVisualManifest);
    expect(getCatalogProductVisualScenes("toString")).toBe(catalogProductVisualManifest);
    expect(getCatalogProductVisualScenes("__proto__")).toBe(catalogProductVisualManifest);
  });

  it("records the exact six ordered illustrative sources and immutable metadata", () => {
    expect(catalogProductVisualManifest).toHaveLength(6);
    expect(
      catalogProductVisualManifest.map((visual) => [
        visual.id,
        visual.sceneLabel,
        visual.src,
        visual.inputSha256,
      ]),
    ).toEqual(expectedVisuals);

    expect(Object.isFrozen(catalogProductVisualManifest)).toBe(true);
    for (const visual of catalogProductVisualManifest) {
      expect(visual).toMatchObject({ width: 1254, height: 1254 });
      expect(visual.caption.trim()).not.toBe("");
      expect(visual.truthNote.trim()).not.toBe("");
      expect(visual.outputSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(Object.isFrozen(visual)).toBe(true);
      const bytes = readFileSync(
        resolve(process.cwd(), `public${visual.src}`),
      );
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(visual.outputSha256);
    }

    const multiVial = catalogProductVisualManifest[2]!;
    expect(`${multiVial.caption} ${multiVial.truthNote}`).toMatch(
      /pictured vial count does not indicate package quantity/iu,
    );
    const overhead = catalogProductVisualManifest[4]!;
    expect(`${overhead.caption} ${overhead.truthNote}`).toMatch(
      /not a scale reference/iu,
    );
  });

  it("produces frozen, deterministic, collision-free signatures for all 56 products", () => {
    expect(storefrontCatalogData.products).toHaveLength(56);
    const forward = new Map(
      storefrontCatalogData.products.map((product) => [
        product.slug,
        getCatalogVisualIdentity(product.slug, product.category),
      ]),
    );
    const reverse = new Map(
      [...storefrontCatalogData.products].reverse().map((product) => [
        product.slug,
        getCatalogVisualIdentity(product.slug, product.category),
      ]),
    );

    expect(reverse).toEqual(forward);
    expect(
      new Set(
        [...forward.values()].map(
          (identity) =>
            `${identity.accent}|${identity.rulePositionPercent}|${identity.recordMark}`,
        ),
      ).size,
    ).toBe(56);
    for (const identity of forward.values()) {
      expect(Object.isFrozen(identity)).toBe(true);
      expect(identity.accent).toMatch(/^(?:moss|teal|ink)$/u);
      expect(identity.rulePositionPercent).toBeGreaterThanOrEqual(18);
      expect(identity.rulePositionPercent).toBeLessThanOrEqual(82);
      expect(identity.recordMark).toMatch(/^PQ-[A-Z0-9-]+$/u);
    }

    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/commerce/catalog-product-visual-manifest.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date|crypto/iu);
  });
});
