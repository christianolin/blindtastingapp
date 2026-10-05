-- Footprint cleanup fp-1, wave germany.mittelrhein: promote.
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: Owner 2026-10-04: "Yes, go ahead (Recommended)" (ship fp-1 after review), with the crumb cap at 1,000 m² ("Keep parcels over 0.1 ha (Recommended)"); review fixes cded7a3, crumb cap 851c21c; this full dry run computed by f48e0b5 (step unchanged from 851c21c).

do $promote$
declare
  v_expect jsonb := '[{"place_id":"ee20b6f4-ec5e-4d99-b98d-684c4f5e93f0","key":"germany.mittelrhein.loreley.burg-hammerstein.rheinbrohl-roemerberg","current_boundary_id":"34e1c92e-f4a8-4d0b-81ed-869c59b19dab","current_sha":"b4df2abdd31fd0c4ef40c966ba8cd9b74bf15167009ca446c5d1e904258820b6","output_sha":"74ff983768ace7e908ba99ffd993ed6b36d118f430bfc443a5a91beef64647b1"},{"place_id":"724963f7-62f6-423b-8cc0-f8212cbac9f8","key":"germany.mittelrhein.loreley.schloss-stahleck.manubach-langgarten","current_boundary_id":"65ec5667-0bf8-44ad-8bc1-08237b17c89f","current_sha":"d29a492cc0bb1a87a96f419231858832b4e5decc30d694067d4fe618376f94b8","output_sha":"a57e02d5e51255b26d44e9c728ea7b75bfa6689c5516214b552ec4865758cf2f"},{"place_id":"7fbd1e1d-d1c8-440d-bbd4-ee08988faf89","key":"germany.mittelrhein.loreley.schloss-schoenburg.oberwesel-sieben-jungfrauen","current_boundary_id":"3827e119-a087-4d24-89d0-6413b0ccba02","current_sha":"f635cb00f2d407d2d0ef247f9dbc2fb1b516ae0699bfb78fe78074017b1235fd","output_sha":"1813b4bdfb0eb48b775e17c04c66002bc148b2727bb83d90a4a5c13eaf089475"},{"place_id":"6a6ebca0-8dff-4469-b642-87a02180d420","key":"germany.mittelrhein.loreley.marksburg.braubach-muehlberg","current_boundary_id":"94c1470b-662a-4954-86a9-33849ff96141","current_sha":"20abb6215142655c62bbc762bf29bbaf32b447e5e1b4d4e491acbc40834ce467","output_sha":"89ff7a7a44fc5cfb26aa4d6ba4b19966b0980ba2f4ebce2c5821c727b10269e5"},{"place_id":"3bc43e59-8774-4880-bb8f-d108d6d4c4bc","key":"germany.mittelrhein.loreley.marksburg.braubach-marmorberg","current_boundary_id":"41799e91-d8ea-4f24-b6f9-e483a53c61e2","current_sha":"2b78df7f776463617c7bbd30db2e2969781fd32d3988b2814d64670c94788acd","output_sha":"e52006e7128c2778959d024d7a518fb48abe08e4e4c67e38c4d4d4df74d9752c"},{"place_id":"3e58ffda-b82b-4510-b25f-241cde18d26f","key":"germany.mittelrhein.loreley.burg-rheinfels.sankt-goar-rosenberg","current_boundary_id":"9689c646-ad1d-4f1c-92e1-1e38dc1566fd","current_sha":"94d0d93485d8cdd5cd7ce1d95f9996c718aebe7d868e5063db38b318f95116c6","output_sha":"5514f8799b34281f38c5f64a3c35684cea273b5739bcc5c6c0703351dd97f52a"},{"place_id":"55b9fb1e-ae89-4023-8a69-26221c56d17c","key":"germany.mittelrhein.loreley.herrenberg.doerscheid-kaub-kupferfloez","current_boundary_id":"2aeb3230-92b6-4940-ab3a-480badfb7a23","current_sha":"947a2db8083d7b5a9860ccd1d2169a58da0ea63a102de68da6895da36017de6b","output_sha":"11259e37ef91d87978635a91134f830257e3e2a327bed819211b482b2e2ebe9d"},{"place_id":"968a63b7-68dc-4343-831e-de803a83afb5","key":"germany.mittelrhein.loreley.herrenberg.kaub-rauschelay","current_boundary_id":"2e24a566-e37d-48be-b2a9-946ee3954e74","current_sha":"6e5f3b4c04895af29d06d5fc18dd1e5fe1ee82b93b6668dd9e5d6005de71bbe1","output_sha":"8e07e6b48bf0343bff2e2c1dcf37f96ca32d54dd6ffd7f9e911a4c3c916719a5"},{"place_id":"bae2c729-e919-4f72-8a3b-8117d11bd4c7","key":"germany.mittelrhein.loreley.loreleyfelsen.bornich-rothenack","current_boundary_id":"2059d59a-7689-437f-b708-5f1e044776f9","current_sha":"30ae2cd5c6ede382a3556e0fe0d13b81a3fccfe359bde3cb48d90a839021033c","output_sha":"3e71824e180ce42f5769dc7d84541195c0155883f4c3d3b7baa1afeecb79bf00"},{"place_id":"4464182c-0108-44fb-a115-799a780c9bcf","key":"germany.mittelrhein.loreley.schloss-schoenburg.niederburg-oberwesel-bienenberg","current_boundary_id":"88e10b8f-748f-434d-9abe-49249d058d8a","current_sha":"46810d45311f7ab614c8034a6d9a0eab5a6b0562477b71b693d0608b35adee31","output_sha":"381f5f569cdf1dd5e5598737ea3b3535c98948edc489602e3e30b66199364996"},{"place_id":"86dc47ee-5226-497a-bd52-624ac8d426b7","key":"germany.mittelrhein.loreley.schloss-schoenburg.oberwesel-hundert","current_boundary_id":"9ec3f6f6-7699-4ee0-96cc-7b76963a8f5f","current_sha":"161490e321c882ab69fad15ab6f34b1a4303bc706b812ca598c5cfdc452b40cb","output_sha":"7c7f813d970e293c853fc6f3bbeacb1be90f0e72e87baf6359e71cd7b3b21b02"},{"place_id":"e40446c7-aab1-4de0-94c4-ba203bf8edf4","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-insel-heylesen-werth","current_boundary_id":"cbbe2ec2-3ecf-486f-bd8f-8961b3e11245","current_sha":"b6ca145e2e127b1865f092c85ac0a1940756b7a88c54d1aee05cf60350bc7d47","output_sha":"ac78c26ed3265717749385759ec5676bd55df257b266857a9a37c637565b0e9d"},{"place_id":"f804ef71-512c-4f83-903f-1184ac34fc1d","key":"germany.mittelrhein.loreley.herrenberg.kaub-pfalzgrafenstein","current_boundary_id":"e260b1b2-22cb-4907-a8ee-469a2dcd9e49","current_sha":"813b041cd7ceba09ad5f4327c9f5dc01aa66f4559a146399146efccbade85511","output_sha":"9a66af1c698b2d6403da8facb9ff30b7fcba8dd4424845579aa7b599669f8173"},{"place_id":"9f9a8d37-fc90-46cf-88cb-414a9ec3d2be","key":"germany.mittelrhein.loreley.burg-hammerstein.hammerstein-schlossberg","current_boundary_id":"6dd52285-3b31-4969-bf24-5dcd80efdc79","current_sha":"b3599f886d726df69101ae999352e5d4cff26a4389dc15960a4eea625fa79faa","output_sha":"b021c65e74bb213168497fa1979a6805459134a39d2f2e38f5956e4e2bdb7205"},{"place_id":"c425fe49-9477-4884-9c40-108e58366130","key":"germany.mittelrhein.loreley.schloss-stahleck.manubach-st-oswald","current_boundary_id":"9ab87d3a-e728-446a-b73a-38216e55d912","current_sha":"8c56e0d966fd834cffcea393905ea9429b03d458dc5e318eaf414760d28b97fd","output_sha":"42d22ad720e8dcf61296362a7e1387653cf8bbf621ce40dc6b1d78eef3fae4cf"},{"place_id":"a99d2c01-099a-4aab-be01-9351a837e733","key":"germany.mittelrhein.loreley.burg-hammerstein.hammerstein-hoelle","current_boundary_id":"0bb26778-aef3-4527-9755-f751d7ff8912","current_sha":"79682043552855e63cee0a7b8776e242e9edd6af47b3eb345fb4f370d7e87f26","output_sha":"b0df26374860b030c7b4d7808a2cfe7a159b2f22c25cbbb938771160bf17c6a2"},{"place_id":"d748f79e-97ae-4145-8526-cb02017ca0ff","key":"germany.mittelrhein.loreley.burg-hammerstein.hammerstein-in-den-layfelsen","current_boundary_id":"d7c48184-f29b-47c4-9557-57c20028d3f2","current_sha":"927a4238ab1696dadcabc35e58ff67b48b44d4381657af2406882cfff7692f7d","output_sha":"c9d77c767c90db8dd352370689ede1dae84caaa6b24a9550f7bce1625cfb9e92"},{"place_id":"20d07063-43a4-4af5-8804-66b340de13d5","key":"germany.mittelrhein.loreley.schloss-schoenburg.oberwesel-roemerkrug-320704","current_boundary_id":"1c8b42b5-29e7-400b-a783-43388f1907d7","current_sha":"516bf826a5e7ba2c5dd50864aec1bb6e331eecc7deb2940fba2b867a6bc242be","output_sha":"63316ebacd70a51a0ae33eae20824b4ae650e403e6b17192d97e369870dbee80"},{"place_id":"53826de0-eca6-454a-94d7-b5953f4af41b","key":"germany.mittelrhein.loreley.burg-rheinfels.sankt-goar-frohwingert","current_boundary_id":"25225001-39b4-446c-a792-3c503931d6a7","current_sha":"f4f99f9c2058cd033f79679171a60196a509efb00f9a1b0dee5012ef25c59cdb","output_sha":"6302178dbb1bcd91d9f23f4ab88b5fe3197a9f2d864bc3603d60ef5d9aac13f3"},{"place_id":"a3876d69-c099-4e92-b5b0-9f74505748eb","key":"germany.mittelrhein.loreley.schloss-schoenburg.urbar-beulsberg","current_boundary_id":"8e244795-9a0b-4601-9544-3b061b85630c","current_sha":"d555c06635cd76540e252d995021addf4502041a5432cebd0b50cd10966cc9d4","output_sha":"676c4413e6f9afb0adadaba2ebeac6730472076bc77ba5588f1570f3e7122e3d"},{"place_id":"b0bb22e7-4be0-4cd6-a84e-1134781bcc69","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-mathias-weingarten","current_boundary_id":"ad464879-a614-4e8a-817c-f553f90a4266","current_sha":"cb64d75bf6b445a13ea12e6c40a244f1042575483eb10831caf2069ecff2611a","output_sha":"e8951e34e240d8bf51280ebbc982e7daeffd6f7e3449e962dc96a1168acd35ab"},{"place_id":"8b8cfc48-a0a8-442f-aa29-18378e35c98b","key":"germany.mittelrhein.loreley.burg-rheinfels.sankt-goar-ameisenberg","current_boundary_id":"8538c213-cdfe-4c7b-a088-89a26a0ba3cc","current_sha":"2db92fbb74056ffb3c0ffe65e75608a39bb169651a2d058301f0b7b95af79856","output_sha":"ee4abbfcba8cbd8e931db995d70f3432fd3b62c8caba244d34555b994f767519"},{"place_id":"f41889e9-4447-4ec6-9e85-9288afda3ac7","key":"germany.mittelrhein.loreley.lahntal.weinaehr-giebelhoell","current_boundary_id":"5800244b-b3eb-4039-9439-fb31fa0c34c6","current_sha":"d99c797670e938608d13ac85872bebbf675c939176813da0a88ed238c9f06e71","output_sha":"ca5e7b18abe36bcc0347e88a43a1a67a2a5ee26d298f670f9125f80fe905462f"},{"place_id":"0c00d7bc-30fb-49f2-bad9-4f18acd16d34","key":"germany.mittelrhein.loreley.gedeonseck.boppard-elfenley","current_boundary_id":"9dc59699-d076-4d40-8f38-93f5c0354277","current_sha":"516e1e5e181a91a0dc708e6e0d228b927f52c524afd988ab81c8370cabda48c5","output_sha":"86ebedb3a2e58b6ead217d93d1b193526e8ee432eff78104b8113ae594f69424"},{"place_id":"7d80d13a-7553-412a-aecd-248bbac526e1","key":"germany.mittelrhein.loreley.gedeonseck.rhens-koenig-wenzel","current_boundary_id":"b0aea19a-60d4-4313-80a3-ea6bcdc3a991","current_sha":"5d589ef7ee7abfc4aaf2479396fef3abd00d2aaada0e7a5a284f9a84072b0df3","output_sha":"8488ff09b34a84907e185435d37bd88e1132db4f3f2a226a472f506cf4b1f992"},{"place_id":"b2048f90-32bd-4dc6-932c-7af7f50cd1d6","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-lennenborn","current_boundary_id":"06472dd6-3069-4940-af41-18b9fec05c83","current_sha":"f6df027f825c3723373cfaf4858aec485bf0483c2a9c00109fe0ced89f21d174","output_sha":"82f1760a3b2f2371f69b942d3016d4bd447bb727214942239de89bea81065604"},{"place_id":"c8c8fe45-d1ff-4bc7-a710-7d2b9dae5c86","key":"germany.mittelrhein.loreley.herrenberg.kaub-bluechertal","current_boundary_id":"f6f0f7d2-b0c6-4d33-b203-a660d17e16bc","current_sha":"10aea90ee07e3d14fc0a2be4459c3b9275a40c36bdbfe8601e1bec75600cb1c7","output_sha":"09c123e8466b01c4c39395d4eaeb6151a16434cd028b29db8fc5df3ed57d8131"},{"place_id":"1cfc6764-d3b7-4d36-9da7-e239f793a0b5","key":"germany.mittelrhein.loreley.schloss-stahleck.oberdiebach-kraeuterberg","current_boundary_id":"ad844546-b361-4b13-9d0e-d2158391917c","current_sha":"71b8271664fcb70031269e3e5bfc84c802b05419c6eecd3dca1e891c6b3d4cc0","output_sha":"0b789f0b3bcdfc06c00f78ccb036d9a1ff076aeb71ddf01fcb1900b7fe57a95b"},{"place_id":"2fb83866-bcdb-4cae-9261-0cbec3d8f4a1","key":"germany.mittelrhein.loreley.gedeonseck.boppard-mandelstein","current_boundary_id":"cab67dd8-1a81-434c-9c38-4671a443a2b4","current_sha":"f10dc9c87b7bed59bdebf1f6d6b1203f4a5f286a15ea82b7dc31e5fa29323e48","output_sha":"da0477ea2b896b3365554b3907f7b1d684aabefbf6c249a5522123e87a4dcf85"},{"place_id":"9441812d-5c0f-42a7-b082-4ff363e85ac9","key":"germany.mittelrhein.loreley.herrenberg.doerscheid-kaub-wolfsnack","current_boundary_id":"dca8a6e0-5508-4067-bc64-64cc8684f673","current_sha":"7e61584d3c56601d2ccfb8ffd405e55c5cf4f29a426c02f01644ff23bf1c2f69","output_sha":"1c44912ae88e1dc0aa81481d98050767ad37a3bca1b4a1fb3eeb140fd8d53d2b"},{"place_id":"fa31c2ec-9064-4cbf-86e8-c1e31a69ccc6","key":"germany.mittelrhein.loreley.schloss-reichenstein.niederheimbach-reifersley","current_boundary_id":"b8ff2984-9c14-4726-95be-107f072b4f65","current_sha":"3d07438b22ec9a7fa67c12d5f0e1ad640edb0068eb585f71119b03d52c244379","output_sha":"627d83d1def95480e2b4ea737ec5f0251f5425b73d0934f577c23388ac4cac9a"},{"place_id":"36f85d7c-bf81-469f-b110-f0f750449dab","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-st-jost","current_boundary_id":"67c776f1-88f7-4a1e-adcc-60205ead739c","current_sha":"8d7f0bb6652f82b9e5c17fb4eb1ce89bc9ce64717a11a1ac66e404f2d66542bb","output_sha":"b944b90b5414fc2b046604ce5cc2fcc8366f32d2f1ba064418c536161555c0af"},{"place_id":"203be13c-bcf9-437c-950d-8d0fe24c5289","key":"germany.mittelrhein.loreley.lahntal.obernhof-goetheberg","current_boundary_id":"f8760a94-d65f-46ea-9297-a1be2a93dfc9","current_sha":"73c3e3b63b49460e087586cea85807e6aa56f5be976c79ac1ba84d1282c569bb","output_sha":"353ed95636759783c0e3dba06dc6481727cd5f56ef725a6a00764f6b05071333"},{"place_id":"2ac7db15-1fa0-4207-9557-6e25879e5350","key":"germany.mittelrhein.loreley.schloss-schoenburg.oberwesel-oelsberg","current_boundary_id":"6ccaeb8f-f733-40ca-b61f-a16b828c8c60","current_sha":"0a597b3fff76b523df9e46e087f37d3885efff2733d5b262058517276b3c6567","output_sha":"ec0091daa63b9d0b585a0e958b9dacef1127931e060a633f872b993dd0c9fe6f"},{"place_id":"06f6365f-11fd-418d-b939-21f3931d1ccb","key":"germany.mittelrhein.loreley.schloss-stahleck.manubach-moenchwingert","current_boundary_id":"ab84e72e-eca7-40b5-ba2c-33764c6f4320","current_sha":"15db9b970ed41491551fe19ce7ff0599ee8d5c6a9b56a6b68b0e3bc5c38a88fc","output_sha":"fd88518fb7a9bda9485325eb335952e06d291b368af9d2a5add0da50fccbe136"},{"place_id":"806680f2-85f9-4469-a686-70be1be275c9","key":"germany.mittelrhein.loreley.loreleyfelsen.nochern-bruennchen","current_boundary_id":"d3a6dec6-d72a-4e09-893c-38620170c507","current_sha":"c10ce2c4b32dffd58f5c909de8b1c3af79426ee2a553ed562e9dfa1684793313","output_sha":"c537f31ac1e6716863218129012adc53d9c54caf147866b3a18d04359ad802f4"},{"place_id":"7a081a68-0811-474b-99ba-b7d7bfb99dbb","key":"germany.mittelrhein.loreley.schloss-schoenburg.oberwesel-goldemund","current_boundary_id":"ea363d70-a779-4b85-802a-bc417152343b","current_sha":"6949266336fc6338e639307f3f3dfc9e91aa99d926fa89a168dbbf10de354ca3","output_sha":"4b97ba11b3e3ca0a517a1b150ea8276cac44785d70dd022ade26b305cc01c202"},{"place_id":"3ec133eb-507e-4b20-9212-0478325cef04","key":"germany.mittelrhein.loreley.schloss-schoenburg.damscheid-frankenhell","current_boundary_id":"c5a975ac-de43-420e-ba62-fa191cc19e1d","current_sha":"23a548b7c971f6c3509ee48249c699cee9a0f9467e78df378c5d3d714b00fc51","output_sha":"75fa237379905f754f9b949c04d16c6b395995955befa2964915e06c9ee8b850"},{"place_id":"3ac9c932-34ae-4a35-b6f9-47464d15f80f","key":"germany.mittelrhein.loreley.loreleyfelsen.sankt-goarshausen-loreley-edel","current_boundary_id":"6b192411-9b7b-444f-bd7d-cf5dfb359ceb","current_sha":"6040e45c7d00e52517f3b103da945ea6c6467d18caf6bec4c0112aaee341db19","output_sha":"38b5a1f179d8bf97718a36ecc7fbb9e54dc6bef950a8f25f6a59d38e93d951c5"},{"place_id":"e49f2487-c7a8-4b96-9dcf-79205364caeb","key":"germany.mittelrhein.loreley.gedeonseck.rhens-sonnenlay","current_boundary_id":"7f806ebd-54de-4860-9690-00ed7b9f66c9","current_sha":"51997b036e8c1540ba414012b8163414049188718d99d3a46f5ebaa6ac6785cb","output_sha":"3efcd3cf261b136b7e4d17ce48101e5294289bbbd51bb2365028c47a1fdc4489"},{"place_id":"41103616-c721-4a94-ae78-8e07511a7d10","key":"germany.mittelrhein.loreley.schloss-reichenstein.niederheimbach-schloss-hohneck","current_boundary_id":"c58fabae-26fa-4ced-8d16-5d8a1677591b","current_sha":"0a48b93e0be64368c8d33f786179165eb0cb0508a56061be2ad870180a6bd99f","output_sha":"34dd390f13e0560cdf3f41d0df92100d83916e4656bea306f0a4f2dbed7ee8b5"},{"place_id":"51713e37-8407-407c-b098-91055b0edfa9","key":"germany.mittelrhein.loreley.schloss-schoenburg.oberwesel-st-werner-berg","current_boundary_id":"fef1df39-5022-4b7d-8b76-fdf021c766f8","current_sha":"1cda428f4d4f4b8f64767323e3552f25f2d41d04157350579c753d1f4571067d","output_sha":"7bb5cbb1c306494185fc4674b001e66d29df8995d6bd8dfdf6a3e38533363ec0"},{"place_id":"98faaaf0-89f4-423f-90ea-e901236ff91a","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-hambusch","current_boundary_id":"46e18640-324a-47d7-9b4d-8b670a22e1a1","current_sha":"c779ec15c38bf629444d6a2a2a32915e8c3938266fc0013a9ae692f6d61d7f5d","output_sha":"af63f8c9b36a8fb52a9261439cca72a91574819d9f3c304a8bee344aaf6287a3"},{"place_id":"369fb623-acb5-48ba-8103-253a1820a7d2","key":"germany.mittelrhein.loreley.gedeonseck.boppard-feuerlay","current_boundary_id":"d473f378-b351-4fa5-b253-b31c22cb5d52","current_sha":"6584d8e02a46a7ce4bf3752a290be2b290e3146f9cdf7b2f66c0484139e4e514","output_sha":"81bfdc2a4622272e6e5a0753e5eba671ea62927e1fe80cfc8a224b3ccc81a3a5"},{"place_id":"ae2dc8cd-6726-4850-ae00-0040bc0449c2","key":"germany.mittelrhein.loreley.schloss-schoenburg.damscheid-sonnenstock","current_boundary_id":"bb7bb799-f696-4833-83e1-f327d536561e","current_sha":"ea88283b9e81b38e68dad27d49c4de7b6c1b70695757ae4a8e6ce8432cd8f0f6","output_sha":"43d82755761ab4884638a22ae54e74f0507612420654c26ec6cac10e5c4d1977"},{"place_id":"faffdebc-8a23-402e-a093-f1c2e62d7972","key":"germany.mittelrhein.loreley.gedeonseck.boppard-weingrube","current_boundary_id":"05b2f55a-e346-45e3-b367-8030244334ca","current_sha":"e2e9d2f59f8dce7182b251af225008d7db1ef6446e72c6c01e1af4973fe0f918","output_sha":"53e5c0112e844fe61d4f3df8b5a5849cc057870febe1a072ed94ac51db3ca5d3"},{"place_id":"5b19fce9-467d-42e3-9534-df2279e89b6c","key":"germany.mittelrhein.loreley.schloss-stahleck.oberdiebach-bischofshub","current_boundary_id":"7aa9733e-984e-47cf-a64c-7498ca45c120","current_sha":"446cbcb5755cb6d5124b9d3164e667cfed8ddaac4d54930aa759e444e6350784","output_sha":"381cabf5d1a9f8df1f285d6ad660c73189a20a6e1f1a6e86e36a5033d03d7348"},{"place_id":"4cd88488-910a-4f22-b455-ea1867d92c18","key":"germany.mittelrhein.loreley.schloss-stahleck.oberdiebach-rheinberg","current_boundary_id":"121db910-9dfe-47ab-83fb-a6bcd8c5bdb9","current_sha":"75c7a9148d8a63bb35c12d1f78e6673bbe2b06066990168bd9af835063f04ef5","output_sha":"1449f650a07e53cda7c16cec2bc6031dc1809a543b34a7953e441f63bb88328b"},{"place_id":"ae5c1ce7-cb5d-4bdb-b410-9d3eef87fb21","key":"germany.mittelrhein.loreley.schloss-schoenburg.oberwesel-bernstein","current_boundary_id":"1cf1945b-e660-4538-9a12-2de4179dac28","current_sha":"38145578f81d6b2722653859b64292235e7b9af26acc172f7f52440da8d7a8c7","output_sha":"469205fbf7c948966cad4715bb5879a46bcfb62d02cbe42032ec2958d40ab1dc"},{"place_id":"2742a78d-aa3c-4d30-b00d-7916e79390b9","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-hahn","current_boundary_id":"7e2629da-185f-40d1-a50a-a0266c0d83f8","current_sha":"ed99252a8f6eedfd71191e8a6f25767c25937d94537deb4e705903a0b72fd3a5","output_sha":"dfe8b2ffdd98ddc981566e102bf5852e387bb0914c6c28fe2651b4c3856aac5e"},{"place_id":"e402e923-a6e5-416c-810d-7f0bd971fc8e","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-kloster-fuerstental","current_boundary_id":"d7eac3b1-4b79-4e2d-877a-9cd56361fe6f","current_sha":"6861531238587091a674faa6ef68c199c7a0882c6e59f6e2d2542b41987b7ce6","output_sha":"38ab32bba500c6821c36873776b48e8f551c62a1d0b2a953de411459e574125c"},{"place_id":"476927db-0dab-4ef7-ba5d-81fe9fa3f5d9","key":"germany.mittelrhein.loreley.schloss-reichenstein.oberheimbach-sonne","current_boundary_id":"969828e4-2607-4fd6-b613-9386f68007d7","current_sha":"45f0e745e3722db032c523313bbe1d7bc7d22a550654b941ac83939586df3036","output_sha":"a74a675d5d80015764c152221c304bed149bd04366f60249903ff6f05e4350e4"},{"place_id":"79d40267-b5e5-4013-a856-d3dd381ae107","key":"germany.mittelrhein.loreley.loreleyfelsen.sankt-goarshausen-burg-katz","current_boundary_id":"96b7a3f1-c3dc-47f7-b36c-b65091e4f0bc","current_sha":"97a0efbabe2f69507b165cdd908676dadfd30e10ca70f2b0cce3a563a9a4aab0","output_sha":"a9ff274d3b7ffd6f355b021208ce02061bed75e37a88a4aee3d2860be43555c1"},{"place_id":"77135dce-4de4-4a77-b30b-0ba71cdc427f","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-wolfshoehle","current_boundary_id":"5ce569d0-659a-41a8-82fa-a456491df008","current_sha":"07e86c0439baee0d19f54e39d07d5f2018219e12ca69955fbd15d80e402dd38b","output_sha":"92935c54abce5e30870e4b4cfb193f271e46f88696da4c3298b11653fed6de18"},{"place_id":"7bf039c7-16bc-4347-9762-6d375a54d3ef","key":"germany.mittelrhein.loreley.schloss-reichenstein.oberheimbach-wahrheit","current_boundary_id":"b8a001cb-6bec-4392-94bf-19a3249e624e","current_sha":"baa47f563b9bc1875a20abc68b8847ed634bafb0b41812c58a87a7853584ae9b","output_sha":"a1b0a8d4cd4169bdc68fe3f78c00c60f482af6d1bda4e5088f246988178fea8c"},{"place_id":"3a502909-ee7e-4fc0-8a0c-42b5bfafedac","key":"germany.mittelrhein.loreley.schloss-reichenstein.oberheimbach-klosterberg","current_boundary_id":"6ec8672a-4366-4e1e-9450-c7a06f703841","current_sha":"3bc26eae7c6fc24de84290e2ec257fe258ecc6b306c5463163cfba19cd4f0eb3","output_sha":"602eb5e13dcccffb15e77fd8c1f91cfb6da1b177f809766654aeca3d446507b7"},{"place_id":"2dfc4288-b9ce-44fe-93ec-c85dca79a180","key":"germany.mittelrhein.loreley.schloss-schoenburg.niederburg-oberwesel-st-martinsberg","current_boundary_id":"01ffed09-621f-4da2-bf1c-986fba9c02aa","current_sha":"7e0d7bd06ed2bf568e05d6d3f41b884c9aa56f1dcb49534a826a1e6b7b846d25","output_sha":"7ba85dd94fffde4ccd090f2388692807a07d9fa9a1fd1d4d0e9db7e96e48231f"},{"place_id":"fff432a1-14f8-45dd-87b8-fc1157deb9cb","key":"germany.mittelrhein.loreley.schloss-reichenstein.oberheimbach-roemerberg","current_boundary_id":"a5609c08-46e0-47ff-bd52-f1bbbbf50ff5","current_sha":"0cfb266c1e5a7baf38c2b767b020c070a3c30718e0e55c46a67acbea6ddae694","output_sha":"2de1f450eaa56536f8e6027dc5f4696ee3083399de09d6a408f8baa0bbe16ff3"},{"place_id":"91fc2f89-a6d9-4362-a3c4-c9005dbd5008","key":"germany.mittelrhein.loreley.schloss-stahleck.bacharach-breitscheid-schloss-stahlberg","current_boundary_id":"ba590c07-b10a-4a03-a31a-b7703526df93","current_sha":"064496a7a8842a2e59198f26816883fcc29fac1651a5b50d2ecc991ed1b6cbaa","output_sha":"73746d8079814d58df21e899e1c143f7c20fd4df43d27204b60e1e09dd467029"},{"place_id":"f77bf7e0-0c59-4ab6-b765-c5586117e023","key":"germany.mittelrhein.loreley.loreleyfelsen.sankt-goarshausen-burg-maus","current_boundary_id":"29622ce9-fe35-4a06-bb13-ef086d126780","current_sha":"4d2cb4d2312cb6e39ede9a37929fea8dc320a3131308dcc84b5c1b2956045724","output_sha":"e5f5c445a441d13e47ba7bd38fb075f3a6a9428e809e62e52358352b92d6b9dd"},{"place_id":"3afcfc66-fd19-448c-9814-fabfd2559b88","key":"germany.mittelrhein.loreley.burg-hammerstein.leutesdorf-gartenlay","current_boundary_id":"d1771161-4a0a-4844-b016-fc6a4fc09b1d","current_sha":"d85b6d374f96efe07ab6d2c358681627b84afa89f9aaffe4f79cee720404c923","output_sha":"06f7874d49e1695a0756ee61fff88fa2516d8140a4fc5837bfee2576ddee482a"}]'::jsonb;
  v_n int := jsonb_array_length(v_expect);
  v_bad int;
  v_refreshed int;
  v_list text;
begin
  perform set_config('search_path', 'public, extensions', true);
  -- 0. never alongside a tiles run: a release built from a half-flipped wave would
  --    publish it before Gate B
  select count(*) into v_bad from public.wine_map_releases
   where status = 'BUILDING' and created_at > now() - interval '1 hour';
  if v_bad > 0 then raise exception 'footprints promote: % tiles release(s) BUILDING in the last 1 hour: wait, then re-run', v_bad; end if;

  -- 1. every input is still current with the sha the owner approved against
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, current_sha text, output_sha text)
   where not exists (select 1 from public.wine_place_boundaries b
                      where b.id = e.current_boundary_id and b.wine_place_id = e.place_id and b.is_current
                        and b.quality_status = 'VALIDATED'
                        and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.current_sha);
  if v_bad > 0 then raise exception 'footprints promote: % input row(s) changed since approval', v_bad; end if;

  -- 2. exactly one staged +fp1 row per place, DRAFT, non-current, with the approved output sha
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
             and b.revision like '%+fp1'
             and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha
             and b.generation_parameters->'cleanup'->>'output_sha256' = e.output_sha) <> 1;
  if v_bad > 0 then raise exception 'footprints promote: % place(s) without exactly one approved staged row', v_bad; end if;

  -- 3. the stamp's own checks: no new overlap with a non-partner, no new ground
  --    outside the containment parent, no descendant ground lost (each <= 1 m²),
  --    area within [-3 %, +10 %]
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
    join public.wine_place_boundaries b
      on b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%+fp1'
   where (b.generation_parameters->'cleanup'->'metrics'->>'new_overlap_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'outside_parent_new_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'protected_lost_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           > (1 + 0.1) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           < (1 - 0.03) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8;
  if v_bad > 0 then raise exception 'footprints promote: % staged row(s) fail the stamp checks', v_bad; end if;

  -- 4. flip: demote the inputs, make the staged rows VALIDATED + current
  update public.wine_place_boundaries b set is_current = false
    from jsonb_to_recordset(v_expect) e(current_boundary_id uuid)
   where b.id = e.current_boundary_id;
  update public.wine_place_boundaries b set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%+fp1'
     and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha;
  get diagnostics v_bad = row_count;
  if v_bad <> v_n then raise exception 'footprints promote: flipped % of % rows', v_bad, v_n; end if;

  -- 5. post-state: each place has exactly one current row, the approved one
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current) <> 1
      or not exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current
                       and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha);
  if v_bad > 0 then raise exception 'footprints promote: post-state wrong for % place(s)', v_bad; end if;

  -- 5b. the independent check (footprint-sql.mjs independentCheckSql), on the stored
  --     rows themselves, trusting no stamp: each place's new ground against the input
  --     row it replaces, on every same-tier non-partner place (old and new shapes),
  --     outside its containment parent, and descendant ground given up; > 1 m² refuses
  select count(*), string_agg(format('%s %s / %s %s m²', x.kind, x.key, coalesce(x.other_key, '-'), round(x.m2::numeric, 1)), '; ')
    into v_bad, v_list
    from (select * from (
    with recursive
    pend as (
      select (e.key)::uuid id, st_geomfromewkb(decode(e.value, 'hex')) g
        from jsonb_each_text(coalesce(('{}'::jsonb)::jsonb, '{}'::jsonb)) e),
    w as (select e.place_id, nb.display_geometry g_new, ob.display_geometry g_old
           from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, output_sha text)
           join public.wine_place_boundaries nb on nb.wine_place_id = e.place_id and nb.is_current
            and encode(sha256(extensions.ST_AsEWKB(nb.display_geometry)), 'hex') = e.output_sha
           join public.wine_place_boundaries ob on ob.id = e.current_boundary_id),
    wp as (
      select w.place_id id, p.canonical_key k, p.display_tier tier, p.primary_parent_id ppid, w.g_new,
             st_collectionextract(st_difference(st_reduceprecision(w.g_new, 0.000001), st_reduceprecision(w.g_old, 0.000001), 0.000001), 3) grown,
             st_collectionextract(st_difference(st_reduceprecision(w.g_old, 0.000001), st_reduceprecision(w.g_new, 0.000001), 0.000001), 3) lost
        from w join public.wine_places p on p.id = w.place_id),
    nb as (
      select a.id aid, o.id bid, st_unaryunion(st_collect(st_reduceprecision(o.g, 0.000001))) g
        from wp a
        cross join lateral (
      select b.wine_place_id id, b.display_geometry g
            from public.wine_place_boundaries b
           where b.display_geometry && a.grown
             and ((b.is_current and b.quality_status = 'VALIDATED')
                  or (not b.is_current and b.quality_status = 'DRAFT'
                      and b.generation_parameters->'cleanup'->>'version' = 'fp-1'))
             and (b.is_current or not exists (select 1 from pend where pend.id = b.wine_place_id and pend.g = b.display_geometry))
          union all
          select b.wine_place_id id, i.display_geometry g
            from public.wine_place_boundaries b
            join public.wine_place_boundaries i
              on i.id = (b.generation_parameters->'cleanup'->>'input_boundary_id')::uuid
             and i.wine_place_id = b.wine_place_id and i.id <> b.id
           where i.display_geometry && a.grown
             and b.is_current and b.quality_status = 'VALIDATED'
          union all select w2.place_id, w2.g_new from w w2 where w2.g_new && a.grown
          union all select w2.place_id, w2.g_old from w w2 where w2.g_old && a.grown
          union all select pend.id, pend.g from pend where pend.g && a.grown) o
        join public.wine_places q on q.id = o.id
       where not st_isempty(a.grown) and o.id <> a.id and q.display_tier = a.tier
         and not exists (select 1 from public.wine_place_relationships r
                          where r.relationship_type::text in ('DUAL_LABEL', 'OVERLAPS', 'REPLACES_WITHIN')
                            and ((r.source_place_id = a.id and r.target_place_id = o.id)
                              or (r.source_place_id = o.id and r.target_place_id = a.id)))
       group by a.id, o.id),
    anc as (
      select a.id aid, q.id, q.primary_parent_id ppid, 1 depth from wp a join public.wine_places q on q.id = a.ppid
      union all
      select anc.aid, q.id, q.primary_parent_id, anc.depth + 1 from anc join public.wine_places q on q.id = anc.ppid
       where anc.depth < 20),
    par as (
      select distinct on (anc.aid) anc.aid, q.canonical_key k, coalesce(w.g_new, pend.g, b.display_geometry) g
        from anc join public.wine_places q on q.id = anc.id
        left join w on w.place_id = anc.id
        left join pend on pend.id = anc.id
        left join public.wine_place_boundaries b
          on b.wine_place_id = anc.id and b.is_current and b.quality_status = 'VALIDATED'
       where (w.place_id is not null or pend.id is not null or b.id is not null)
         and coalesce(b.boundary_method::text, '') <> 'DERIVED_FROM_DESCENDANTS'
       order by anc.aid, anc.depth),
    des as (
      select a.id pid, q.id, 1 depth from wp a join public.wine_places q on q.primary_parent_id = a.id
       where not st_isempty(a.lost)
      union all
      select des.pid, q.id, des.depth + 1 from des join public.wine_places q on q.primary_parent_id = des.id
       where des.depth < 20),
    dg as (
      select des.pid, st_unaryunion(st_collect(st_reduceprecision(x.g, 0.000001))) g
        from des join wp a on a.id = des.pid
        cross join lateral (
          select w.g_new g from w where w.place_id = des.id
          union all
          select b.display_geometry from public.wine_place_boundaries b
           where b.wine_place_id = des.id and not exists (select 1 from w where w.place_id = des.id)
             and ((b.is_current and b.quality_status = 'VALIDATED')
              or (not b.is_current and b.quality_status = 'DRAFT'
                  and b.generation_parameters->'cleanup'->>'version' = 'fp-1'))) x
       where x.g && a.lost
       group by des.pid)
    select 'new_ground_on_neighbour' kind, a.k key, q.canonical_key other_key,
           (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_intersection(a.grown, nb.g, 0.000001), 3)) d) m2
      from nb join wp a on a.id = nb.aid join public.wine_places q on q.id = nb.bid
    union all
    select 'outside_parent', a.k, par.k, (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_difference(a.grown, st_reduceprecision(par.g, 0.000001), 0.000001), 3)) d)
      from wp a join par on par.aid = a.id
     where not st_isempty(a.grown)
    union all
    select 'descendant_ground_lost', a.k, null, (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_intersection(a.lost, dg.g, 0.000001), 3)) d)
      from wp a join dg on dg.pid = a.id) x where x.m2 > 1 order by x.kind, x.key, x.other_key) x;
  if v_bad > 0 then raise exception 'footprints promote: % independent check failure(s): %', v_bad, left(v_list, 3000); end if;

  -- 6. the neighbour cache, in the same transaction
  v_refreshed := public.refresh_wine_place_neighbours();
  if v_refreshed < 0 then raise exception 'footprints promote: refresh_wine_place_neighbours() refused (%)', v_refreshed; end if;
end
$promote$;
