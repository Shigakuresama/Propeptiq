export type CatalogProductVisualScene = Readonly<{
  id: string;
  sceneLabel: string;
  caption: string;
  truthNote: string;
  inputSha256: string;
  outputSha256: string;
  src: string;
  width: number;
  height: number;
}>;

// Original generated masters, encoded once as sRGB WebP at quality 84 / effort 6.
const scenes = [
  ["front", "Front", "Straight-on studio composition.", "Illustrative view only.", "5164763c33c82d3db31a3fdf63fa248931c3843e823f65164a5924ff0fb525b3", "cb78b5bedeccb16c6bb620776f1a6c8d870059728c332a29b2bcdca0fa188779"],
  ["three-quarter", "Three-quarter", "An angled studio detail.", "Illustrative view only.", "7a06992f37dfbaca9f5c501615caadd7b49581607bed73556625e04d53d50a05", "4e278686c655b7bc803dcb94f6862d7f3bc5db7378e85a2bbf4fd0354a3a5882"],
  ["multi-vial-study", "Multi-vial study", "A three-vial studio composition.", "Pictured vial count does not indicate package quantity.", "864f0f27bdbef52fdbdf095957be182b2b684909c4a7bda7c8fe3a9daf376be8", "fdcb5dcf0b2884b1def2c8f12d8485de8456bf23ecd7e39b436747089e3568de"],
  ["copy-space-detail", "Copy-space detail", "An offset studio composition.", "Illustrative view only.", "72194dd2ebf65008729c867c9f59082255d06bde5849f79a052bc41f67b98218", "7f9af4a1d804afddbc501d3e421c3d651b4f3670365866f36c6c2f52ef1aece8"],
  ["overhead", "Overhead", "A top-down studio view.", "This illustration is not a scale reference.", "9e904bb1f308c6153992d739bf46e2541d6b116bfb900f81594715f7711ad6f5", "cea92ba0cf03f0eceb2a0f2af32a5622030ef38d589ebc420d695d6b32fe1be4"],
  ["ambient-studio", "Ambient studio", "A softly lit stone-surface composition.", "Illustrative view only.", "82e27fd60008638b48c0c6aad0f9471eac8c1ff583af764dd82610013e9d407f", "8601dec17f4b72abfdabd8da095ff4b1afe142b330c5d447ae81afb4a45f03bf"],
] as const;

export const catalogProductVisualManifest: readonly CatalogProductVisualScene[] = Object.freeze(scenes.map(
  ([id, sceneLabel, caption, truthNote, inputSha256, outputSha256]) => Object.freeze({
    id, sceneLabel, caption, truthNote, inputSha256, outputSha256,
    src: `/catalog/visual-masters/${id}.webp`,
    width: 1254,
    height: 1254,
  }),
));

const productFronts = [
  ["bpc-157", "2bf1318c4c1dbc4ecc178489cc44ea7e47f259977e2eb4106eb0454842cd2a8b", "14962877a70be6667b17ca843100f99ccf2d3a88f89a0c595e66422969679893"],
  ["tirzepatide", "4cd6b2c1bb22846c7dd9d6e972f2d852b1c162781cc24fb550a3d1c17362bbbb", "236f9248340369ab8c898e3c98cee5b61ec15d3de0d50dc06fd37e775dbf4b51"],
  ["retatrutide", "f76a0b28116d2b928e62aee9c7cef8664e0186606c8b542d1993541b952160db", "498bb5fcada2c34b94bd6cd0078f44606d03f5652211648a47eb68e70db9ac38"],
  ["nad-plus", "8d9dc1a7f75871ec57fe3a25f1db30f03912ccf63c7c8844e3dd9e6292c812d0", "4d5669cc0200b78347a6f85d244f26e3175a51293d23282c9f500e5824dc47b8"],
  ["semax", "852571841f2bdc7384ef454d5272b82fbe4144851e94ea1e8b02f5dfbbd7645b", "e845ad20ac9843bd030a2ab83b0b78e39ecd910655852ecc1f6d4832882d580e"],
  ["selank", "abf3280ab817845ee3df65c3fbd800ce9701763d0ed7fa9e193d12f509ebceb7", "8749b8e5d79a72e43e25d5b95270c59f4cf961039d3f346dca7bcff28b47ed85"],
  ["hgh", "2334aa15abf8467a89044a456e479919dc4f39e9a0ca489bb72d206eaaabbc08", "83e03da22de66dd19ff871e8132274bace6104c17c57830ad2eee4983878e1d4"],
  ["ghk-cu", "9462cea2604da5c5f6266eef54420474a33eee9b6a789d314ed7f025f6277d25", "a9ab9684635c01cc52efdd8afb8028c5f2d68714bf117009bc4183086c3d94ed"],
  ["tesmorelin", "40650c82a9fb2f1594ea76591ae0193f32afd493eb8df55afeec913b74ec8361", "bb9a4db8f7e27c64c268f606303d9552e802398aa34a739e39ba2f80afaf2e9e"],
  ["tesmorelin-ipa", "12ea0f492c9741997809f4472d3af573a4f387c1ee09c9f51cb5e44fcbd26ca3", "19539cc9b24be4639cb5e7105b72cc9a787fefcaf225331ba5573b0c2bfd452c"],
  ["tb500", "91fafb134595074ee4cf0e728624561b984b10ed342f95fb163912486480cd0f", "57bcddbcf57823310045184e5737fe02f125e7634dddfa56d76f20edcd0c78ed"],
  ["bpc-tb-blend", "91adf3cc683b6361e44e5872ebe58f4fbe81d2506d6aea6d14cb2b711fecb593", "596921c9bdb9179e21fe7bb8422f20b9d045009768cf63d03d3e4d353d8721f0"],
  ["bpc-tb-blend-bb20", "05d5f05bb71d3730e4964006ed583c7e66cf6237d337bb3cf15a0c6a522e068e", "807ae0db1348e63d5c16609c9ea0121ed76562571a3fef68e29e063a6e5f0db1"],
  ["bpc-tb-blend-bb40", "4b80c921c7ba2a57db7b7bceb157e4b7b286f4b7080a588cb31889de1b405cc1", "4dbbd91c4ac056ae525e3a632fb40625e44f7b03dcf8ffea7deb894148d6ac8b"],
  ["aod-9604", "0e1957df914cb920afcf46fe44f16fb9537fa3c9244b492827d779fc82664355", "459d1ae99505f9abcd9ded060c8dfd5bf3149af1700016435c492b1a715a1d57"],
  ["mots-c", "92b2f75a102f38f1e17940e96bbb7359a2a83d56420e6ddbe46587f2da6f6670", "a9c731019a25fbac950e3cf658e8f9fa2839432b7301d6cf81e9cd448adf204f"],
  ["semax-selank", "2d24a2d387a3eb4692e896fbe70c95515ea3e977cf4705bc3c16177e519f4728", "54251b3874b03b9fa1aaa7d6ec48b1efedcdad400c301ec025777bcabd6f27df"],
  ["thymosin-alpha-1", "8e60bd98150e1507219941ce041fe7920ef3ad8e63a76eef24e633c73bd43c7d", "89ba1bdab87470784e1fe22470669c38a51a1d0db76f2c9e10aa07eb61f19bbd"],
  ["dsip", "6ebc3f2a26bc335aad444d757e4804a57eb129c037b5d022dfcb91d7eba4278d", "a7e6783700a3fe694ccc0ca25274f5fd8c0f1f9987cb9a6113f97421b6cae71c"],
  ["cjc-1295-no-dac-ipa", "e9d2dbd5a9922dc1ac9263a1c445eb3a777f0d029da3b34da4508c3b1dc322b5", "8806ef697845a0872acac9915f708084b98eeddc57187300c4e444c6fb88edec"],
  ["cjc-1295-no-dac-ipa-cp20", "d6cbd3254ba2b227e5868530967a635bdb4a0a516349a8a21c29095ca017a3ac", "cdc8297a8aa3af4cc4e1064eda212c7927fb1f44fd8c0fc6a8343359d4e08036"],
  ["ipamorelin", "0c31a8097d011be87620766f9de20f47bfb3481144f1a71d5a955b3b398fe0fa", "b8e6c3850ecca97b3843e2edabf55b28d02db4e1e23d5cfc4d7ae4ffde4c9829"],
  ["hcg", "cd1580b761af131f5adbadfd98403abc165710d521e11bb2f4b9ba8846b1618a", "61fe155863957e96b23f7cfadd0138481fc995a54aca732a9815b553e2ef7df8"],
  ["cargrilintide", "d4ba4f0b1b31770c60f45406883bbd22104893f6bffdb83c5e7bf8ba7e2257e5", "6ef2d0dc417bb223c83328ce6bcc9223c6d55e1b299ca3cc7785900d5b98eb74"],
  ["sermorelin-acetate", "520556d712c0fbedde1d076823ae5a30fb4b5ffda44389a8459f3b07cc92655c", "97f1477ade0de9377bf19cb9b497a88812c66d412df337fba25e08018d2ba846"],
  ["pt-141", "2158e33df50b70c575704b40ecf580498dcac4dc5ff969a6b29421f4c0070e93", "6e92c3f5404bb51c26bf644d1d239352236c226fecfcfd7c34673b9c1fb6b68d"],
  ["glow", "bf8ee8571c7068c5c103d90b2ed235ceee71f9d7b619c7eadbf2869044279a6f", "2f15c6e9f6be2b7956defc8b4a0210d393b920576eb08575c1b07358f54bca60"],
  ["oxytocin-acetate", "101a8b53e8939710468582e26bf6ab85049eb04a6a301cc0bf24241bb4a662f0", "2167fc52938c91eca76d83286a5b8caa23a4127dacba2b7f2a863988457083e8"],
  ["ll37", "c48b5f203d4c85bb5bc1336285a3f287714e5eb3155b26055d565352da97551d", "03cc9e21372aa1566080f21e2512c490dd8fcbb74348fa24e2e85d81c185a60a"],
  ["glutathione", "a8d117b131d3772dcd1196de569702a7649546d103abee28a6fd9ab9ba1e71d5", "66af5d42ba95075cd797db28acdad908c2a767f8b3a1c026722cbe4be2927328"],
  ["snap", "f0090e66035b4abc07fad4bdecaa3ca8f443f030499acc7d3833b09b6dd26409", "3efa81d610264dad99001d7da07fc76b1b03b97c527f34060d00f9d3d95bdba3"],
  ["li-po-c", "7ae93f30deced1d58d3dd2d866081710fee7ba756d3986f484063b6562b56e08", "1a5a2e8f38cdfe2e1f1a258646eb62aa9b3b7242477af117e55ec147cb6019a9"],
  ["li-po-c-without-b12", "efb9d5fe41ae1b891fb98e0b97a46560018b03ce20386b7b1188a9efee207821", "fb481c3f2258b869c6aef67cbe98ab41008554fde481aaa7163af3b39eaa18e3"],
  ["lemon-bottle", "1fa88d17b4c438e84315474f0c656738db39fc258bc493822e44e6522c5ea0e5", "adae8a0c400273612285bb21b7ee52a72e97c2d562699d6bf65ed1ec3fb46b36"],
  ["mt1", "bcc0de28ed56f20da61613b008b67b474f3b98458391bfca8d20f387823b16fc", "a4d6b4c7193b04c1fb0c13f4667b63b27ff2f7c8780032c77f2bd9badf1f69e4"],
  ["mt2", "e77af579219d07d4b0c9f6d0a6b53de79aa352bda9c4137a5fd137cf6d3059c9", "66fd6b4b4e2c27b7652c605c6a1608c56d51cc91fecddf4a957669b3f048dd9b"],
  ["ss-31", "f1b2003241b29997ceb58847d99e7e79eb9fac9c92b169a2245235aabce96360", "9e9d0f65e27fee320b8f9fe576bdc337698c967f6e804087e3a58c1d07be6f41"],
  ["klow", "918fafb46c4d177b05162de751daccb37afa69b94397f5390420faf2a0f56362", "7c35253cd5508e716519bdd90ad806eb7b43c96fd1b22ad530a046ba4f65ec20"],
  ["5-amino-1mq", "726a1772ac188ce10cd8beacff4f71a14923eeacbe0a51ba9bad0a94c9574f98", "1a1f95c81efa989290874612ed638afbb46d910f0f88254ff8cc498aa83e14f5"],
  ["kisspeptin", "5cdd4057d6df8ff0e2a80794fe30e36776297c1b34b5560437d5ef8e08ac644b", "e1f5d78165d9a213bdadff6bd991d9c199810b3dd21a3a97dbea0ce419a4a9cf"],
  ["pinealon", "511202a8df8ae0b7992d4caee9255d923d2495132e9ab3ac41bfe407f7f5ce08", "bf41acc3417cbf520c39def6f026e070697865b65afb52093ad23778332d60c7"],
  ["pe-22-28", "0ce771cf9b6969b784111153122d1b7aa01bb327ffb8544b396d586d323c4422", "04c43a612af6dae7b1e302b4a76ff13b35188bc995073a25b624f88b329fcac2"],
  ["igf-1-lr3", "8bb9d259466021ff031d616d4b59ab63014908fe36adbf424441bb055c0e0430", "4c842a44792f14161eec36748500df2e308b348c9cbb266b2f700573f30ac709"],
  ["ara-290", "5a42a304447c8ca1b73b6696db1775514e8c92388d090a6eae45abaf6c10a5d6", "dd6eaaf4008a4fd618c7763e44b282ff08ed1decb38f1a5edfc83cac30156ae5"],
  ["acetic-acid", "7d6f12e2503628191ccca0766ec13310396507d7b9b490a0eff50a7d953c9060", "8fee30e341e232bc471b2f0084190e79fdf8cfbfae8e20fff027c8d6de1fab7e"],
  ["semaglutide", "364de1fb06dd438c856ece8c693ab43f628d22c22b3b073b650a44971f90c5f7", "49be36892028545713483ce2966f476b21a67b45fc9b0a895b3ca6ab950d0212"],
  ["kpv", "fe9e7c1af2f617fc15f4657de036e20e55f8572b4ff22e3f6c597a56ef763920", "34ed81f79d6a872d555f5dd287a89c107db202c5bf332624e6d999248e52e6cd"],
  ["epithalon", "f4ba27b637feca47751b2da7d2c8c3ed0bd468f6475f77a1f22c2964478f52c2", "d5efb8ee5f53ac251add00f43ed11c116ee4c030300c71d13599c093594182ea"],
  ["cjc-1295-with-dac", "f2e786e7ac06fd98068ba2854116f8b70425f255db8bca0a340a546e1028e35e", "26b2d4ab766cfb4ef4c8cfc2ef11a1ecfe332a68216662c7c416951e96199e57"],
  ["cjc-1295-no-dac", "280f2ce00bf364f7950995e485af87ca5e44733ab2ebd1c66be51be868bf97a5", "20e80cb1b3366978d4dd2086a09e11174049b0106de051a8744bc104830252e0"],
  ["grp-2", "ad1e852ccc5b13476a013d75295347ad1e1837bc89c97430a32ad0125f99b59d", "cb42b12eeb009c37f0a7205c8496402a62222a6d937d45b78d9b023fb8430904"],
  ["vip", "cda58fe9fbef414c5a5f412423dcf59b4011712cc2c3cbbb277b2d36986b8d61", "1fa1eb0636e7f7619c58f0b96c42cb14916f9e7239cc7d2329154cb169ad5add"],
  ["survodutide", "3539a0bc69df7a18e540b245e9068d21cc92f55cfa54d56a25c9ed0baa255699", "de2755df546dae2b95ec1f28880c17166d89fab4e035b1959eaa3aab4209c81e"],
  ["admax", "7ac8de0d029404557d194107fe2b3c4a6d716fa8660d98f74cd833a846a8fc10", "fb9cc121470e46a56afc81ae83bd3a7257f1ecad7accc1e5df6c867f58b93dc0"],
  ["cartalax", "0c58362163627e157a3dbbadd6bcaa282a5f9922d5d76ea7fd0b950e80a5c658", "8bdcfdea4893f1bcbd02e430a19464488040efd7ee35c310dbe9b8ffd19fd853"],
  ["bac-water", "7b3f034b452ca2dd470c8a7daf56f73da09343f13a13372ca8e87f71a8a8315e", "90522683ceb92f53af162967418483edd6381189658f4d3baf98bc216b7f70fb"],
] as const;

export const catalogProductFrontVisuals: Readonly<Record<string, CatalogProductVisualScene>> =
  Object.freeze(Object.fromEntries(productFronts.map(([slug, inputSha256, outputSha256]) => [
    slug,
    Object.freeze({
      ...catalogProductVisualManifest[0]!,
      src: `/catalog/individual/${slug}/front-v1.webp`,
      width: 1254,
      height: 1254,
      inputSha256,
      outputSha256,
    }),
  ])));

const productAlternates = [
  ["bpc-157", "three-quarter", "80bbed05f7483e35d63ce9dd88e46c2607003b7dccf4daab169a151eed45bcb8", "16ac54de8690cc9c723f14d439048bcd6ed85d06683709d130543c89dcae970e"],
  ["bpc-157", "multi-vial-study", "833d0c2d07f8dbc26af6cdef2529aaa6af154662187ce45a02257c38811af65c", "34a4a4b71cbb858008aadf7d7e7c03476f31ea843cefc68e7409000278acb003"],
  ["bpc-157", "copy-space-detail", "030078125785a7a917e87281899fd62e913aa87aae7713047e4567696ce37064", "db8367ce4190320b18518d235c8a8fd6c7bdbf354bae2481e3a0bde78ab80650"],
  ["bpc-157", "overhead", "09008ce87bb9e806129c31dcf1b75870d4b416d308f5204b5030e14e447566b2", "3b6212949c0daaeb1e574bb7082256a0aba9ec1cfba26f8823961a60fec18b69"],
  ["bpc-157", "ambient-studio", "0827d04ceb0ced5e4ad17f1279fdf3c92f2f8ab0b0150a26f83f337cdfbe8bd2", "52780ad0b5fb8122bf8fb5c83a6ddf453f9d6c69a96f36a8401fb628e1e7a0c5"],
  ["tirzepatide", "three-quarter", "ec5dfe448fc24a76de6ef4c12ba569b8a488e757bda0f39dc723848a64f6040d", "af0e761bd31ee3d53150644758a985f465bfa908cd12cda7013454c399595d3b"],
  ["tirzepatide", "multi-vial-study", "7403fbd967b549a5b01ec828ec5e0cad26c3c69800f06a8c620d3e1d27603daa", "d5144530a355b93548bd26c77949157e0f7aeea0e2b8b69c451d9916eaf172db"],
  ["tirzepatide", "copy-space-detail", "95cb21fa36c89e852f3e538cbbe34e6482eb94c6d7f512c97a2b5dad1a57aca1", "4f743657078ed3da22516cb2e338ee08ba11ecd09f0e7b7f3caa4a27539aa885"],
  ["tirzepatide", "overhead", "666b339ddf72dfe8fc0354a491b8b3dad7782f5448afd6667a408cfc6e99492a", "9dbcc1f70d9fca89cc4c12365289fa01efd566f5a093b5681ea538b4326becce"],
  ["tirzepatide", "ambient-studio", "d61497fe7a11ba4cf62da804337a9b00a0e45b1a45845dd935f5ae33dd215744", "25f89ff909494ceb48611f75a27cd077bc93ae14e7babde90a022023899c3e87"],
  ["retatrutide", "three-quarter", "8629e93aed48a9a3d5ca168e03b132d3eec73a8915fda8a356c3f2f576a6b499", "a66dd47902ad696f2d9eadf0377dba788e875f6607eccf80d3ac65fa95822095"],
  ["retatrutide", "multi-vial-study", "a86ae49e5d42c6933852e0689a18a14172145d65de344922ae503359d98294b4", "da7550d7a75ca88831ebab9a5ee2210d6e5295ea1b09c960c1510a8e1ec9b70f"],
  ["retatrutide", "copy-space-detail", "6c8e09c4eb62c731c60cab7bbdd9fd8e143f80014ae1de9686c69fb745186ad9", "c066184519abbc12167e08cee0f9c157309cda9d23ff17bba2fe5e73d1eb5883"],
  ["retatrutide", "overhead", "955cf4d588b76f51bb21b858d5980c49dda9e27b6cf89cef64b6ae16a0dca28e", "1a55529a0a3a29e9970fc2ea98f9523f0d5317c91199dc5f29b695b78846e1d2"],
  ["retatrutide", "ambient-studio", "055cf3e2204e16dfa81c417ff0ca6a91d87cfe5227935a28db21f8d313893757", "08a8dd0d7739f5fc907b96069904dbe1e3a94abbc425c5582f9be49ee0697f8f"],
  ["nad-plus", "three-quarter", "788fe63bd49c8121e49b4cc92ce57cfbd053a851726cfad5ddc85c390ccbfdfc", "57540642d052ae9af9bd3616e53c5fa1f8b1d95e28bb0b9cbeeaa0f758a8aa6b"],
  ["nad-plus", "multi-vial-study", "38412355002807e80b88ad6388a6744a397adf300b9bcef11d4e115ce3f5aa9c", "410e72fa93e65b51504b71a2c64f8370e1fdc7cd361ea7f8123be5973ef0ab54"],
  ["nad-plus", "copy-space-detail", "fe99f3b17156af1d7552494281fd9156192c4a399fb530cb5d01878b3cd8278a", "3f1aec7262fe1e33cd6ef7ba6f8c1f3f1af2fb472f45277c6b3feb374615b3dc"],
  ["nad-plus", "overhead", "8b8af8970a3a3ef6883258e96cec091b9e7af3694d8364dadfc6f0d522e0ee31", "01299ba9b6de5d5288ae6f841846b5fda68ed54cf758a5d51c92e866148447b7"],
  ["nad-plus", "ambient-studio", "34a9de8d5ac469a54e58eadf41f977839846e70d911ab1610e08151b1bc4ed58", "f0818bb5e4960997da4a2598db97077a3b5d734fd8880ee132206f861290efee"],
  ["semax", "three-quarter", "a7536edea9efc21e6a67724a28c7e0997e81d9e1b6fa175985a4bf135dd6454b", "0850a79420a9b64e055f7db30a47bd8adc6c2b494443958b66b77e11c3c1ae8d"],
  ["semax", "multi-vial-study", "f03f9b09bb1ec64307ce55eee39e7740814b8c7fc0dfad3145a032d8af93e64f", "0e974cd9a0e947abc8744f3d8de23454ad116c30167c5c3f2274d0fa3cb36e82"],
  ["semax", "copy-space-detail", "1c6009c7aff7d55dbe22bc16aa9b784d33f2ef962dbf98d0f36fa41db9328cb7", "c73a29229320e9eb915b4d9caf3dcb1f9d6a7d2bab841cfd771cdf913069573c"],
  ["semax", "overhead", "6a5d97ae65099c1cc45d9878cce0823b40ebca3f8c6938679dc3dfa8b1aa0ecb", "6fab9a372d80728908d85c9a994e34e915f3da75b7f40635b3e71fff90dbac08"],
  ["semax", "ambient-studio", "d4ea3d4ff14c9014ec294d34ddd501e8a4bb3fd081c9bec769147bac7dec495c", "d0b02c17adf4f596a3d5766776856d564758f808046901a54c0df9a292f6837e"],
  ["selank", "three-quarter", "5f31705c2691ea68994e64d13c78f89ba73e8f64c2cfa4a1e5703fefa0625cf5", "fc341029cb3a928672431259c1fdcce2ef0316e29eb4c29afc3a5c379ff47fc1"],
  ["selank", "multi-vial-study", "86de0ca20a0b1f362b513775d0ec2b2a1527b10a363ee335c225d4de254aa361", "e153a8043b5b59de0593a43511c9466067f48fa9740c38497e6ac780a51a9dd6"],
  ["selank", "copy-space-detail", "81c38103886b4d629b0c4ec33431379c910013a171f2daf01e3f12ef9f9d63a9", "8c2b6ca3755f262054f742ba94553d6782b2afd5d03572232ebe51f1a5100b6d"],
  ["selank", "overhead", "939bbc621c64da24e9b19860ca2fe0e49d49102483648cff4982441cbce1435d", "216e525da72140545052675f546a62c648b9a53dbcfc6cfaf805e33130285647"],
  ["selank", "ambient-studio", "01df3372d2b0cb74389cb16e13c15d8c99d0a6a0e412aacd2b2695d414034807", "455285ae7323625c169099be842efe2b66149de7db67ad99180cb2039d5fedf0"],
  ["hgh", "three-quarter", "baf8f96e5f9f7d76c2d5e72754b6de5b5d7fc1aaafed3167f7f6df6e11b18342", "a8bfb8222f8cbb345f6ce4a226b1f82363437ba885555e4a1b6540920b2fc303"],
  ["hgh", "multi-vial-study", "e73fb8fed5b2c0c633fb131823a25fb6233b7fd123dbf67a48f591c54e29cbdb", "a1988d91013c33eee7913340ea3bb77da16fc0987d39398af3046e6f9e270937"],
  ["hgh", "copy-space-detail", "d7e8c387c41788a743a3a861a84a562024fe1674638ad2b1cf2082e6a5b905bb", "db0f42dbfd3e131060dcab183f5d11dd7bc7fe380bf15f962c07df822c087944"],
  ["hgh", "overhead", "a20488cfea299aae7061fc3e13b1df0674ce52627d5ae6303dfd33b9f1226114", "a80664c1ca0ca42121d21d9de00847ef687d0e7a70fb4e415d61d799b7c95ab7"],
  ["hgh", "ambient-studio", "ae7d633991adb90b8e75138263de438cd89e973af5fe455365097d62017765be", "cb95b56752881295cfcdffc028b3364d88d4be01e5b40e4de9ce224f0d79fa2f"],
  ["ghk-cu", "three-quarter", "04bcd0565374d04cf4853d2be00c1ad7d78323a9422b7d75a6ce4f05ce538c6e", "2c994d4ab661f7a7d738368724758e1ee782e0819e3557666604f7910447f027"],
  ["ghk-cu", "multi-vial-study", "061310921879ec5007b58ab3e1f7c9544b015eded840cf9546d6a8d14a9da7cb", "584e69770f7ef8bf5e8cf7c82b2d223f6ca0e927ea69156bdf4f5f3fcb401833"],
  ["ghk-cu", "copy-space-detail", "abc8f01b1560da50c07db3255c4f761d59ac997b3f70a87681924c1192f65a40", "c8bdcf95614b131d9c5932cf3cda0d7a0ad722b6b7293f72c13e303c1ae205e6"],
  ["ghk-cu", "overhead", "533215f8d133f7a1a78fe3c2e75d4868d7079c9d6f53638cab9d9470926fb4fd", "e1a6456f69ecdc6b2bfd56b83661e2d42ecc8726ee88db622be2f0f085ce1819"],
  ["ghk-cu", "ambient-studio", "8056d62cbc66363424446442fb75a4b35d6e5ca36d91cf776d0d10b033420510", "bddb674422df366c14697c9fd0400225ef50199d8c78dd94677638badd350441"],
  ["tesmorelin", "three-quarter", "881c481a7e36def7a7a83e4a008608c000b45f6565d38ad55507055ee85425cd", "eda37af974be1aa17cad13b2890d317f27c33e2e477ef15661134f2565e3ef48"],
  ["tesmorelin", "multi-vial-study", "3f7f0498b407cc7d04bbd19b2c45fffe3d15ddf60496f27e594c35f88a5aa701", "a9e0052e2462377731d2293ec4efb3fe4cb068e85346f0c2651228bf8e4f1eac"],
  ["tesmorelin", "copy-space-detail", "42d79a63f65d7992d56015d53473412e95a9613d91270edbc6bbbbd6e5cf8b67", "bcbbf6f09c0e101ea9a45fc2131a39d3e817c20fb6e45eade31aabd6f2ecd577"],
  ["tesmorelin", "overhead", "08445af6a1813abaf4f552eaf1a62aabdd952636312344ea96ca3b927dbaf908", "3167e83bba92fb0e3283de3b9d1ff2e5ee353f1570198e44fdc04287352a6f79"],
  ["tesmorelin", "ambient-studio", "d9b115f7bc84bf726c7c50f18d464d773e3299750463d87deeea5c040c77c9b8", "4d7fcbe846e5e7e110838a634f6e0fb34cf7164e71322d4b495c6a0116435bde"],
  ["tesmorelin-ipa", "three-quarter", "4b5aee65039c819c9ae431c7ff38a92210dc308b750c19f0d832081b4837389d", "6ca4b9f11782e97f740fec416cd5af301b42f5022f390c3bc105743a74253a2a"],
  ["tesmorelin-ipa", "multi-vial-study", "79809c7d692a542ef46624877fc1ad3b2c3539e8fc4d8f5834b63efbd2a74687", "f7ae993c825d344b37b1df75b073285408ce9ebf11415ebad3666ff922c371a1"],
  ["tesmorelin-ipa", "copy-space-detail", "746c8204a25f922fc825a02e31b071d4cecdd062f83c4ed9e5ce796180078b8f", "2588d15be2473204598146937317434f1ef5c17103b62f863b8ebbba19d4dda6"],
  ["tesmorelin-ipa", "overhead", "c845232b99630dcfcafb88fe4265958350aad4eda5e095d5a0216e5157886f0a", "24a733dd008325c92885348f8375b38faf44e0dda06e5540a634dd9b575f7d3d"],
  ["tesmorelin-ipa", "ambient-studio", "5105e44c927eac4e65b95c635c204bdcbc835bfb44d4b341a88344683edb3b09", "1e98476a49467e5de787ecbd1c6b69e3ed8a2ff195303e52d7e4873c60cf42db"],
  ["tb500", "three-quarter", "0b1788aac0bd337089692e7b282bd3d9d71db640f9c1cebc7d871efa8e5117af", "f34639d987a05a244e8a3f5b62b34fc3e3f248661c5fc478f4e1cd306233d814"],
  ["tb500", "multi-vial-study", "4e7ea3d61740178ba614471e6acdff9546782cc62eaa06bcb2e9f5104b4cd1e1", "c632285a37ffc3a963f2ee41eb42ec824d1a5c7ece494ee9909a7189e4dc86e4"],
  ["tb500", "copy-space-detail", "bfcb688f1060bd6cc892e3e2fad91aef735b770394f076d0086f079772d9336d", "a2ebfaa0ddbdaf58a42feb0db0cc2a2d366926c710129cdf2f1d312482144e08"],
  ["tb500", "overhead", "26375c33a4b397a2ec3f819ddd3ed6978c5a14153e81e765ef73df03c628b594", "0026f5b72d1e706c8dd4fb793f8d14ff2b2af7e99c900e1faf55ee5bea78d776"],
  ["tb500", "ambient-studio", "c035490ffb5598468d56a61eb0cfeea8d732b13d45470ee3d624a39f43b6d342", "1d5e3243f69ee39562e51ff79f652915c7654dac66832d8cf181bba975d23ea6"],
  ["bpc-tb-blend", "three-quarter", "37ff42875fb1ad2b45532b78ba26b81a5aa2eb7971e0f6cf4b0335527816306b", "22939028652f5583c8bfc4c3849bd9883ac0b8ef3ae1020ed92de6f8d69fd049"],
  ["bpc-tb-blend", "multi-vial-study", "ec04b4af60e17aab0977000de55ec4a425fef7536eef00619e1beffbea31b8e5", "c6624f2b4fb390ac3b191412e70700b250d5cf7c1a29df541a92f2372e15f893"],
  ["bpc-tb-blend", "copy-space-detail", "18436a0d26a8b9a2cbb4de0721811b02037074410392c4cf89a50188ebbba2ea", "c46d965683cb3c2706ae931f8e7e60be68af2c45fc9be39b7e567df37bec27bc"],
  ["bpc-tb-blend", "overhead", "cbac340447ccb99c160fbb04a137d95929ff4ac15ec1264a088e2f5dc69fb577", "92d36232b891d59d35aea0f06f36846a546903000006129a20cae29ea511ec2a"],
  ["bpc-tb-blend", "ambient-studio", "57b4be942014131f217d9933733d38b619a3184762c96f8944cf259c4c65efbf", "2041b2cb51aab4aec410123c1145727cf4f61c91f37884a96da90793f01ffa86"],
] as const;

const productAlternateVisuals = Object.freeze(Object.fromEntries(
  [...new Set(productAlternates.map(([slug]) => slug))].map((slug) => [
    slug,
    Object.freeze(productAlternates.filter(([rowSlug]) => rowSlug === slug).map(
      ([, id, inputSha256, outputSha256]) => {
        const sharedScene = catalogProductVisualManifest.find((scene) => scene.id === id)!;
        return Object.freeze({
          ...sharedScene,
          src: `/catalog/individual/${slug}/${id}-v1.webp`,
          inputSha256,
          outputSha256,
        });
      },
    )),
  ]),
)) as Readonly<Record<string, readonly CatalogProductVisualScene[]>>;

const resolvedProductScenes = Object.freeze(Object.fromEntries(
  Object.entries(catalogProductFrontVisuals).map(([slug, front]) => [
    slug,
    Object.freeze([
      front,
      ...(Object.prototype.hasOwnProperty.call(productAlternateVisuals, slug)
        ? productAlternateVisuals[slug]!
        : catalogProductVisualManifest.slice(1)),
    ]),
  ]),
)) as Readonly<Record<string, readonly CatalogProductVisualScene[]>>;

export function getCatalogProductVisualScenes(
  productSlug: string,
): readonly CatalogProductVisualScene[] {
  if (!Object.prototype.hasOwnProperty.call(catalogProductFrontVisuals, productSlug)) {
    return catalogProductVisualManifest;
  }
  return resolvedProductScenes[productSlug]!;
}

/** Stable visual identity only; never represents a lot, certification, or SKU. */
export function getCatalogVisualIdentity(slug: string, category: string) {
  let signature = 2166136261;
  for (const character of `${category}:${slug}`) {
    signature = Math.imul(signature ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const accents = ["moss", "teal", "ink"] as const;
  return Object.freeze({
    accent: accents[signature % accents.length]!,
    rulePositionPercent: 18 + (signature % 65),
    recordMark: `PQ-${signature.toString(36).toUpperCase()}`,
  });
}
