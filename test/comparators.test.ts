import {DropCampaign} from "../src/twitch.js";
import {getCampaignIds, loadJsonData} from "./utils.js";
import {broadcasterComparator, endTimeComparator, gameIndexComparator, requiredMinutesComparator} from "../src/comparators.js";

test("gameIndexComparator", () => {

    const campaigns: DropCampaign[] = loadJsonData("campaigns-0");
    const campaignIds1 = getCampaignIds(campaigns);

    // Sorting with empty list should have no effect
    campaigns.sort((a: DropCampaign, b: DropCampaign) => {
        return gameIndexComparator(a, b, []);
    });
    expect(getCampaignIds(campaigns)).toStrictEqual(campaignIds1);

    campaigns.sort((a: DropCampaign, b: DropCampaign) => {
        return gameIndexComparator(a, b, ["1924769596", "460630"]);
    });
    expect(getCampaignIds(campaigns)).toStrictEqual([
        "8beb2258-da1e-4ab7-b738-d7addbe65e59",
        "45984db5-cb1c-4483-9cda-cccfd6844088",
        "4db93128-3d4c-4893-af14-b1f3537c6753",
        "85afb22d-01e3-4ae0-8bd3-d2ff5285c3a7",
        "32481796-bfba-4835-af9b-6119e16b86e2",
        "16f1c23f-161e-4dbf-8897-aa40dae8581f",
        "916e9018-1a93-453b-ae8a-b583df4d63bd",
        "7200c1fb-af7a-4c07-846c-4cb5d735b18a",
        "eaa72ba0-7ff7-4d47-8b4b-9623d069aa64",
        "7e9d57b9-550f-4c46-ac0b-9cdb8832aebf",
        "7d4ff867-7f7c-40ae-ad84-f176f4eaf582",
        "1367c1a2-f26c-41ef-b2e4-3caee952e868",
        "0a60667f-5f56-4bae-a6de-b07721bcbb86",
        "1b56a599-f7de-466e-a3ec-e4585429b0eb",
        "ecf151f5-d6d5-463d-87b3-68e40013c596",
        "5b817fba-1b4c-43e6-861e-74182dc813ae",
        "6df388b6-520f-4b83-a4c2-7919bbfef147",
        "64a8ce87-f178-4f2f-8267-4b232dd2e548",
        "9e952e52-d1cd-4545-9903-e30ea31908fb",
        "6557e268-369c-405c-9e4d-2a6afb38c881",
        "48da83ee-cbe7-4700-8d60-8d257bfc35a3",
        "c8e5c941-ba30-453f-8ce2-5b928561fd6e",
        "58bd96d0-f92f-41fb-b492-a9cf036b7a3e",
        "b261024e-dba1-4a29-80d4-b662cd1c432e",
        "68ddb4aa-9ca3-4939-8a75-9d426ce35d3f",
        "6fb692c8-940e-4b28-bfeb-f5e42f7a843e",
        "599e8e84-095e-49bf-ba55-1db46911090c",
        "bf5f7cdf-428b-449f-83d9-974e28fe7767",
        "7ff13f25-d916-4d48-8fc5-0dc9676c9283",
        "4e016ae9-c521-4b7c-933a-5572f733cd1f",
        "53519e69-cff8-4a60-a061-9f30efe5b1a7",
        "eabbf395-2e04-4888-b8f1-9321610755c0",
        "09d707b9-2767-4479-b294-ff2c45b2191d",
        "a70ac78a-1a76-41d2-9888-5a4d49cab22a",
        "d411c0ae-f2dd-44ab-98db-e7db302733d1",
        "2e8c60b9-6ad4-451d-a660-5f20a18e74a5",
        "e3cad219-7bf1-4fb0-87c5-130e2393abdb",
        "8a622b4f-3f34-4b2a-9aee-4f23e17e4216",
        "5504f4a2-7a8e-42e8-aa3e-aee58a4e0644",
        "5eb0cd42-eef8-412b-bf89-a6ace6108758",
        "da03fc6f-fe64-4b18-ba79-f86ee426a731",
        "eaead573-8911-4ebc-98e9-26769183acc7",
        "c1e62bfd-7923-4a40-953b-1abdb73290c7",
        "65eacaba-0c39-4f5e-99de-e0efbd326bca",
        "94d81157-1a49-4a8e-984d-f418febf8423",
        "04a20092-fe5c-4d25-a571-f185b4e982ad",
        "0765972e-22e2-4bab-b9b5-037db7843796",
        "09df0515-c100-4e65-ba79-5acb4a4ee8a9",
        "bab961b2-c509-4401-aec8-5829c8c55025",
        "b0172b54-819f-404d-b079-5b03568f6234",
        "28244e29-cefe-4167-842d-d80fbe919684",
        "2cb7fc6c-b155-48fb-bb6b-a1383a8d2423",
        "bacf49ee-bf7b-4fa7-be83-a62180299af4",
        "d321670d-5542-4e0d-af9b-782591b7bf51",
        "6d2593f4-590f-40b4-9fdc-8c10946d99e0",
        "1940df3b-eab7-4726-a645-898ad01ef03b",
        "54546a7f-8402-429d-bdf4-9c47434b0152",
        "be17b177-d0c2-4798-8bb4-d47343762c67",
        "978fe085-81ca-4bf7-9366-e82b9a1f6235",
        "52a194a9-08f4-44c4-b49c-0e5fd9407737",
        "4123ea90-416c-4915-92a1-30d828288fc6",
        "4fee9ce9-2050-4008-a616-5ac1f48439c5",
        "d157e848-b49b-4a75-9d13-58b80f3a7e06",
        "d16fed14-db13-492f-a02a-1e2b7e1db908",
        "83984c54-af73-4923-be06-404bb602b214",
        "dd880d9c-08d4-4e20-a1d5-a8b63d095b4d",
        "818c3d94-564d-4663-8aef-50905eb00476",
        "4f0f2ba3-5c47-4a54-a3cd-918610e991a4",
        "2e150805-a00b-4fbd-9a3b-7bcd1f8f064a",
        "6d93fd3f-512e-4827-bc1e-3da3ae774655",
        "70c8ea95-54fd-4fc8-8dbd-b74c76aa3c28",
        "9bc54f9a-e965-4cbd-84eb-22354a89e8bb",
        "396bbf3e-108c-446f-8f6a-fb67ad6259d8",
        "4cb59c29-c6cc-40d2-8105-bc7e052970b2",
        "16a4a59e-9481-4ebe-9837-ac4592b5c7bb"
    ]);

});

test("endTimeComparator", () => {

    const campaigns: DropCampaign[] = loadJsonData("campaigns-0");

    campaigns.sort(endTimeComparator);
    expect(getCampaignIds(campaigns)).toStrictEqual([
        "be17b177-d0c2-4798-8bb4-d47343762c67",
        "53519e69-cff8-4a60-a061-9f30efe5b1a7",
        "52a194a9-08f4-44c4-b49c-0e5fd9407737",
        "396bbf3e-108c-446f-8f6a-fb67ad6259d8",
        "2e150805-a00b-4fbd-9a3b-7bcd1f8f064a",
        "eaead573-8911-4ebc-98e9-26769183acc7",
        "4123ea90-416c-4915-92a1-30d828288fc6",
        "bf5f7cdf-428b-449f-83d9-974e28fe7767",
        "32481796-bfba-4835-af9b-6119e16b86e2",
        "94d81157-1a49-4a8e-984d-f418febf8423",
        "7d4ff867-7f7c-40ae-ad84-f176f4eaf582",
        "d321670d-5542-4e0d-af9b-782591b7bf51",
        "bacf49ee-bf7b-4fa7-be83-a62180299af4",
        "6d93fd3f-512e-4827-bc1e-3da3ae774655",
        "65eacaba-0c39-4f5e-99de-e0efbd326bca",
        "1940df3b-eab7-4726-a645-898ad01ef03b",
        "4fee9ce9-2050-4008-a616-5ac1f48439c5",
        "599e8e84-095e-49bf-ba55-1db46911090c",
        "6d2593f4-590f-40b4-9fdc-8c10946d99e0",
        "48da83ee-cbe7-4700-8d60-8d257bfc35a3",
        "2cb7fc6c-b155-48fb-bb6b-a1383a8d2423",
        "83984c54-af73-4923-be06-404bb602b214",
        "68ddb4aa-9ca3-4939-8a75-9d426ce35d3f",
        "d411c0ae-f2dd-44ab-98db-e7db302733d1",
        "54546a7f-8402-429d-bdf4-9c47434b0152",
        "4cb59c29-c6cc-40d2-8105-bc7e052970b2",
        "6557e268-369c-405c-9e4d-2a6afb38c881",
        "58bd96d0-f92f-41fb-b492-a9cf036b7a3e",
        "5504f4a2-7a8e-42e8-aa3e-aee58a4e0644",
        "6fb692c8-940e-4b28-bfeb-f5e42f7a843e",
        "0765972e-22e2-4bab-b9b5-037db7843796",
        "5b817fba-1b4c-43e6-861e-74182dc813ae",
        "28244e29-cefe-4167-842d-d80fbe919684",
        "d16fed14-db13-492f-a02a-1e2b7e1db908",
        "dd880d9c-08d4-4e20-a1d5-a8b63d095b4d",
        "2e8c60b9-6ad4-451d-a660-5f20a18e74a5",
        "818c3d94-564d-4663-8aef-50905eb00476",
        "4f0f2ba3-5c47-4a54-a3cd-918610e991a4",
        "a70ac78a-1a76-41d2-9888-5a4d49cab22a",
        "09d707b9-2767-4479-b294-ff2c45b2191d",
        "e3cad219-7bf1-4fb0-87c5-130e2393abdb",
        "1367c1a2-f26c-41ef-b2e4-3caee952e868",
        "1b56a599-f7de-466e-a3ec-e4585429b0eb",
        "978fe085-81ca-4bf7-9366-e82b9a1f6235",
        "b261024e-dba1-4a29-80d4-b662cd1c432e",
        "5eb0cd42-eef8-412b-bf89-a6ace6108758",
        "09df0515-c100-4e65-ba79-5acb4a4ee8a9",
        "70c8ea95-54fd-4fc8-8dbd-b74c76aa3c28",
        "c8e5c941-ba30-453f-8ce2-5b928561fd6e",
        "da03fc6f-fe64-4b18-ba79-f86ee426a731",
        "64a8ce87-f178-4f2f-8267-4b232dd2e548",
        "ecf151f5-d6d5-463d-87b3-68e40013c596",
        "eabbf395-2e04-4888-b8f1-9321610755c0",
        "04a20092-fe5c-4d25-a571-f185b4e982ad",
        "b0172b54-819f-404d-b079-5b03568f6234",
        "16a4a59e-9481-4ebe-9837-ac4592b5c7bb",
        "7ff13f25-d916-4d48-8fc5-0dc9676c9283",
        "8beb2258-da1e-4ab7-b738-d7addbe65e59",
        "16f1c23f-161e-4dbf-8897-aa40dae8581f",
        "4e016ae9-c521-4b7c-933a-5572f733cd1f",
        "8a622b4f-3f34-4b2a-9aee-4f23e17e4216",
        "c1e62bfd-7923-4a40-953b-1abdb73290c7",
        "9bc54f9a-e965-4cbd-84eb-22354a89e8bb",
        "9e952e52-d1cd-4545-9903-e30ea31908fb",
        "d157e848-b49b-4a75-9d13-58b80f3a7e06",
        "6df388b6-520f-4b83-a4c2-7919bbfef147",
        "7200c1fb-af7a-4c07-846c-4cb5d735b18a",
        "0a60667f-5f56-4bae-a6de-b07721bcbb86",
        "bab961b2-c509-4401-aec8-5829c8c55025",
        "85afb22d-01e3-4ae0-8bd3-d2ff5285c3a7",
        "916e9018-1a93-453b-ae8a-b583df4d63bd",
        "45984db5-cb1c-4483-9cda-cccfd6844088",
        "7e9d57b9-550f-4c46-ac0b-9cdb8832aebf",
        "4db93128-3d4c-4893-af14-b1f3537c6753",
        "eaa72ba0-7ff7-4d47-8b4b-9623d069aa64"
    ]);

});

test("broadcasterIndexComparator", () => {

    const campaigns: DropCampaign[] = loadJsonData("campaigns-1");
    const campaignIds1 = getCampaignIds(campaigns);

    // Sorting with empty list should have no effect
    campaigns.sort((a: DropCampaign, b: DropCampaign) => {
        return broadcasterComparator(a, b, []);
    });
    expect(getCampaignIds(campaigns)).toStrictEqual(campaignIds1);

    campaigns.sort((a: DropCampaign, b: DropCampaign) => {
        return broadcasterComparator(a, b, ["worldoftanksna", "RespawnTV", "StripesStreams"]);
    });
    expect(getCampaignIds(campaigns)).toStrictEqual([
        "baa136f8-5cab-4b35-a62b-f58afd4ed5d0",
        "c9c5eb64-39a6-4c75-a1f1-0d8d9115d765",
        "7f2f68f4-b6ab-412f-8049-5aac0e06c32e",
        "955a0a75-3b7e-4110-bf14-7146374c1d9f",
        "8ecafda5-195b-495e-812d-a958548c880d",
        "a3ca994d-1362-440c-a4d9-bec6974a1157",
        "0449e699-1434-4f1c-9e71-b1e34aaa721d",
        "4b955bb4-eff1-4dd6-973f-b3b34bb2c987",
        "aabcadf0-9187-4d75-95ed-e5f0dfc2d5c7",
        "7505dead-e843-49d2-a1b4-87e174f4aac5",
        "502a103b-d995-4b5b-ba25-50ef98bd8cc8",
        "59d7c3f8-dd27-45c0-82b4-210b63f94cdf",
        "cddc2473-5b21-4574-8df6-0c797db54840",
        "e16ecd78-b866-4d8c-bfc2-7813b5832908",
        "6b8c369a-1a20-4e1d-9c6e-541206b95984",
        "48822fff-69a9-4e91-945b-e9b75781b7db",
        "7f481dfd-9356-4143-80fc-6e15a7ace4ac",
        "85613742-fab3-4543-bb7a-387afd4216fc",
        "4b19d465-4095-409f-9914-b4a9971255c4",
        "25b8eac9-e975-4eca-b158-e510ed3d5346",
        "77eeafbc-8b69-453f-81cd-722233419a32",
        "38408cf9-958b-4ecb-8344-a262bf160fd9",
        "e11b7d3b-756b-4934-9ddf-a8e7747e2669",
        "57711c2f-43ec-4189-85f4-4469e9b01f38",
        "ecd578ee-4682-4489-957b-f9045ad0cf95",
        "056551dc-a901-4308-a644-825c163977f7",
        "88256f27-849e-4103-9ea2-0f392e848a37",
        "c4778b6b-2203-4947-a8ea-63acbf253190",
        "307cf5db-d02d-418a-a412-47b039828b08",
        "4cdd3b85-5d16-4f51-ab4d-331d6b5db7d1",
        "08818193-af85-4858-a1b6-5edb699c2f43",
        "cadb1d45-6cbf-4df8-aee4-7f95f023409d",
        "534f6011-d5bb-482a-9e60-fbe325f49d44",
        "5ddfe825-35dc-4c94-8366-9fc9c50b186c",
        "44467e8c-904b-4ef6-9106-97d22ef909bb",
        "f93f8de3-b1bd-4e24-bf3d-32104c7f2939",
        "64aa9a13-f681-4239-882f-1d96e3fee7bb",
        "ee7aa075-24f3-488b-a992-83959239b656",
        "8fe91443-19c5-4d92-ac09-a5c8cce4c8f2",
        "92abadcd-75e6-4d02-854a-8235b7964ef1",
        "fbc69108-66b2-4b48-a963-dca3dc0046d9",
        "c19225e2-ca6a-44cb-9dc9-6f867a52afe2",
        "8cf4b64d-c666-4a2e-826f-f1d4e4d3b017",
        "3eaaa277-454b-4fca-84ea-3fe831eed184",
        "ffddfe09-a909-46c0-bcd4-c4e00d3f2fef",
        "a1397c40-f900-4b95-a782-f406be0c1bf5",
        "a5b82569-98a3-48fe-97bb-6da5a5cca3f1",
        "672fa3e5-a011-40f0-8516-1ca6e686c5a0",
        "5ca53b86-988b-4420-b7a3-cb82b5970b23",
        "cc610b76-e58d-4779-9ba9-37aa46bff156",
        "f0ba6b0e-9f0c-4439-8d50-ea97fbe0210e",
        "3e054c69-b03d-4c86-857d-a82d8580c22e",
        "df3ef194-c3f3-4a52-9d58-c336aeb57536",
        "25c33709-28f4-487e-99fd-851fc01bcdd5",
        "225a4240-abc2-4b76-a72a-3014dcf73437",
        "241beca1-7930-4c1c-acb0-4744bda9a485"
    ]);

});

test("requiredMinutesComparator", () => {

    const campaigns: DropCampaign[] = loadJsonData("campaigns-1");

    campaigns.sort((a: DropCampaign, b: DropCampaign) => {
        return requiredMinutesComparator(a, b, new Set<string>([
            "0449e699-1434-4f1c-9e71-b1e34aaa721d",
            "4cdd3b85-5d16-4f51-ab4d-331d6b5db7d1",
            "f0ba6b0e-9f0c-4439-8d50-ea97fbe0210e"
        ]));
    });
    expect(getCampaignIds(campaigns)).toStrictEqual([
        "4b955bb4-eff1-4dd6-973f-b3b34bb2c987",
        "baa136f8-5cab-4b35-a62b-f58afd4ed5d0",
        "8ecafda5-195b-495e-812d-a958548c880d",
        "aabcadf0-9187-4d75-95ed-e5f0dfc2d5c7",
        "7505dead-e843-49d2-a1b4-87e174f4aac5",
        "502a103b-d995-4b5b-ba25-50ef98bd8cc8",
        "59d7c3f8-dd27-45c0-82b4-210b63f94cdf",
        "a3ca994d-1362-440c-a4d9-bec6974a1157",
        "cddc2473-5b21-4574-8df6-0c797db54840",
        "e16ecd78-b866-4d8c-bfc2-7813b5832908",
        "7f481dfd-9356-4143-80fc-6e15a7ace4ac",
        "85613742-fab3-4543-bb7a-387afd4216fc",
        "4b19d465-4095-409f-9914-b4a9971255c4",
        "77eeafbc-8b69-453f-81cd-722233419a32",
        "0449e699-1434-4f1c-9e71-b1e34aaa721d",
        "6b8c369a-1a20-4e1d-9c6e-541206b95984",
        "48822fff-69a9-4e91-945b-e9b75781b7db",
        "25b8eac9-e975-4eca-b158-e510ed3d5346",
        "38408cf9-958b-4ecb-8344-a262bf160fd9",
        "e11b7d3b-756b-4934-9ddf-a8e7747e2669",
        "57711c2f-43ec-4189-85f4-4469e9b01f38",
        "ecd578ee-4682-4489-957b-f9045ad0cf95",
        "056551dc-a901-4308-a644-825c163977f7",
        "88256f27-849e-4103-9ea2-0f392e848a37",
        "c9c5eb64-39a6-4c75-a1f1-0d8d9115d765",
        "c4778b6b-2203-4947-a8ea-63acbf253190",
        "307cf5db-d02d-418a-a412-47b039828b08",
        "4cdd3b85-5d16-4f51-ab4d-331d6b5db7d1",
        "08818193-af85-4858-a1b6-5edb699c2f43",
        "cadb1d45-6cbf-4df8-aee4-7f95f023409d",
        "534f6011-d5bb-482a-9e60-fbe325f49d44",
        "5ddfe825-35dc-4c94-8366-9fc9c50b186c",
        "44467e8c-904b-4ef6-9106-97d22ef909bb",
        "7f2f68f4-b6ab-412f-8049-5aac0e06c32e",
        "f93f8de3-b1bd-4e24-bf3d-32104c7f2939",
        "955a0a75-3b7e-4110-bf14-7146374c1d9f",
        "64aa9a13-f681-4239-882f-1d96e3fee7bb",
        "ee7aa075-24f3-488b-a992-83959239b656",
        "8fe91443-19c5-4d92-ac09-a5c8cce4c8f2",
        "92abadcd-75e6-4d02-854a-8235b7964ef1",
        "fbc69108-66b2-4b48-a963-dca3dc0046d9",
        "c19225e2-ca6a-44cb-9dc9-6f867a52afe2",
        "8cf4b64d-c666-4a2e-826f-f1d4e4d3b017",
        "3eaaa277-454b-4fca-84ea-3fe831eed184",
        "ffddfe09-a909-46c0-bcd4-c4e00d3f2fef",
        "a1397c40-f900-4b95-a782-f406be0c1bf5",
        "a5b82569-98a3-48fe-97bb-6da5a5cca3f1",
        "672fa3e5-a011-40f0-8516-1ca6e686c5a0",
        "5ca53b86-988b-4420-b7a3-cb82b5970b23",
        "cc610b76-e58d-4779-9ba9-37aa46bff156",
        "f0ba6b0e-9f0c-4439-8d50-ea97fbe0210e",
        "3e054c69-b03d-4c86-857d-a82d8580c22e",
        "df3ef194-c3f3-4a52-9d58-c336aeb57536",
        "25c33709-28f4-487e-99fd-851fc01bcdd5",
        "225a4240-abc2-4b76-a72a-3014dcf73437",
        "241beca1-7930-4c1c-acb0-4744bda9a485"
    ]);

});
