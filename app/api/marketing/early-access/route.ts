import { NextResponse } from "next/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const KLAVIYO_PROFILES_API_URL = `${KLAVIYO_BASE_URL}/profiles`;
const KLAVIYO_SUBSCRIPTION_API_URL = `${KLAVIYO_BASE_URL}/profile-subscription-bulk-create-jobs`;
const KLAVIYO_LIST_RELATIONSHIPS_API_URL = (listId: string) => `${KLAVIYO_BASE_URL}/lists/${listId}/relationships/profiles`;
const KLAVIYO_REVISION = "2025-01-15";
const KLAVIYO_FORM_ID = process.env.KLAVIYO_FORM_ID?.trim() || "VRx5RB";
const REQUIRED_LIST_ID = "WebRpa";

interface EarlyAccessPayload {
  email?: unknown;
}

interface KlaviyoProfileListResponse {
  data?: Array<{ id?: string }>;
}

interface KlaviyoSingleProfileResponse {
  data?: { id?: string };
}

function getKlaviyoHeaders(privateApiKey: string) {
  return {
    Authorization: `Klaviyo-API-Key ${privateApiKey}`,
    "Content-Type": "application/vnd.api+json",
    Accept: "application/vnd.api+json",
    revision: KLAVIYO_REVISION,
  };
}

async function readKlaviyoBody(response: Response) {
  const rawBody = await response.text();
  let parsedBody: unknown = null;

  try {
    parsedBody = rawBody ? (JSON.parse(rawBody) as unknown) : null;
  } catch {
    parsedBody = null;
  }

  return { rawBody, parsedBody };
}

async function findProfileIdByEmail(email: string, privateApiKey: string) {
  const filter = encodeURIComponent(`equals(email,"${email}")`);
  const lookupUrl = `${KLAVIYO_PROFILES_API_URL}?filter=${filter}&page[size]=1`;

  const response = await fetch(lookupUrl, {
    method: "GET",
    headers: getKlaviyoHeaders(privateApiKey),
  });

  const { rawBody, parsedBody } = await readKlaviyoBody(response);
  console.info("[early-access] Klaviyo profile lookup response", { status: response.status, body: rawBody });

  if (!response.ok) {
    return { error: "Failed to look up profile in Klaviyo." as const };
  }

  const profileList = parsedBody as KlaviyoProfileListResponse | null;
  const profileId = profileList?.data?.[0]?.id;
  return { profileId: profileId || null };
}

async function createProfile(email: string, privateApiKey: string) {
  const profilePayload = {
    data: {
      type: "profile",
      attributes: {
        email,
      },
    },
  };

  console.info("[early-access] Klaviyo create profile payload", profilePayload);

  const response = await fetch(KLAVIYO_PROFILES_API_URL, {
    method: "POST",
    headers: getKlaviyoHeaders(privateApiKey),
    body: JSON.stringify(profilePayload),
  });

  const { rawBody, parsedBody } = await readKlaviyoBody(response);
  console.info("[early-access] Klaviyo create profile response", { status: response.status, body: rawBody });

  if (!response.ok) {
    return { error: "Klaviyo rejected profile creation." as const };
  }

  const createdProfile = parsedBody as KlaviyoSingleProfileResponse | null;
  const profileId = createdProfile?.data?.id;
  if (!profileId) {
    return { error: "Klaviyo did not return a profile ID." as const };
  }

  return { profileId };
}

export async function POST(request: Request) {
  let body: EarlyAccessPayload;

  try {
    body = (await request.json()) as EarlyAccessPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const emailValue = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(emailValue)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const privateApiKey = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
  const configuredListId = process.env.KLAVIYO_LIST_ID?.trim();

  if (!privateApiKey) {
    return NextResponse.json({ error: "Server is missing Klaviyo configuration." }, { status: 500 });
  }

  if (configuredListId && configuredListId !== REQUIRED_LIST_ID) {
    return NextResponse.json(
      { error: `Configured Klaviyo list ID (${configuredListId}) does not match required list ID (${REQUIRED_LIST_ID}).` },
      { status: 500 },
    );
  }

  const listId = REQUIRED_LIST_ID;

  const existingProfile = await findProfileIdByEmail(emailValue, privateApiKey);
  if ("error" in existingProfile) {
    return NextResponse.json({ error: existingProfile.error }, { status: 502 });
  }

  let profileId = existingProfile.profileId;
  if (!profileId) {
    const created = await createProfile(emailValue, privateApiKey);
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 502 });
    }
    profileId = created.profileId;
  }

  const klaviyoSubscriptionPayload = {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        custom_source: `Website early access form (${KLAVIYO_FORM_ID})`,
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: emailValue,
                subscriptions: {
                  email: {
                    marketing: {
                      consent: "SUBSCRIBED",
                    },
                  },
                },
              },
            },
          ],
        },
      },
      relationships: {
        list: {
          data: {
            type: "list",
            id: listId,
          },
        },
      },
    },
  };
  console.info("[early-access] Klaviyo subscription payload", JSON.stringify(klaviyoSubscriptionPayload));

  const klaviyoAddToListPayload = {
    data: [
      {
        type: "profile",
        id: profileId,
      },
    ],
  };
  console.info("[early-access] Klaviyo add-to-list payload", JSON.stringify(klaviyoAddToListPayload));

  try {
    const klaviyoResponse = await fetch(KLAVIYO_SUBSCRIPTION_API_URL, {
      method: "POST",
      headers: getKlaviyoHeaders(privateApiKey),
      body: JSON.stringify(klaviyoSubscriptionPayload),
    });

    const { rawBody, parsedBody } = await readKlaviyoBody(klaviyoResponse);
    console.info("[early-access] Klaviyo subscription response", { status: klaviyoResponse.status, body: rawBody });

    const acceptedJobType = (parsedBody as { data?: { type?: string } } | null)?.data?.type;
    const hasValidJobType = !acceptedJobType || acceptedJobType === "profile-subscription-bulk-create-job";
    const isAccepted = klaviyoResponse.status === 202 && hasValidJobType;

    if (!isAccepted) {
      const detail = (parsedBody as { errors?: Array<{ detail?: string }> } | null)?.errors?.[0]?.detail;
      return NextResponse.json(
        {
          error: detail || "Klaviyo did not confirm subscription.",
          klaviyoStatus: klaviyoResponse.status,
          klaviyoBody: rawBody,
        },
        { status: 502 },
      );
    }

    const addToListResponse = await fetch(KLAVIYO_LIST_RELATIONSHIPS_API_URL(listId), {
      method: "POST",
      headers: getKlaviyoHeaders(privateApiKey),
      body: JSON.stringify(klaviyoAddToListPayload),
    });
    const { rawBody: addToListRawBody } = await readKlaviyoBody(addToListResponse);
    console.info("[early-access] Klaviyo add-to-list response", { status: addToListResponse.status, body: addToListRawBody });

    if (!(addToListResponse.status === 204 || addToListResponse.status === 200 || addToListResponse.status === 202)) {
      return NextResponse.json(
        {
          error: "Klaviyo did not confirm list membership.",
          klaviyoStatus: addToListResponse.status,
          klaviyoBody: addToListRawBody,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, listId, email: emailValue, profileId });
  } catch {
    return NextResponse.json({ error: "Could not connect to Klaviyo." }, { status: 502 });
  }
}
