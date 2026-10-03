// The REAL journey shape: generated from gt-factory-os buildJourney() (api/src/sales/journey_view.ts)
// at the backend head of claude/settings-p1-conversation, test mode, one test phone.
// Regenerate it rather than editing it by hand: the texts are lead_texts.ts, byte for byte.
import type { Journey } from "@/app/(sales)/_lib/types";

export const REAL_JOURNEY: Journey = {
  "mode": {
    "state": "test",
    "outreach_gate_open": false,
    "test_phone_count": 1,
    "phone_number_id_set": true,
    "send_token_set": true
  },
  "steps": [
    {
      "id": "first_menu",
      "trigger": {
        "kind": "first_message",
        "when": "menu"
      },
      "text": "היי, כיף שפניתם ל־GT Everyday!\nהנה {{menu}} שלנו: משקאות שהאורחים שלכם יצלמו, והצוות שלכם ילמד להכין כבר ביום הראשון.\nויש עוד הרבה מאיפה שזה בא (:\nאיך תרצו להמשיך?",
      "footer": "מדי פעם נשלח לכם עדכונים על המוצרים. לא מתאים? כתבו \"הסר\"",
      "buttons": [
        {
          "kind": "reply",
          "id": "lj.order",
          "title": "אני רוצה להזמין"
        },
        {
          "kind": "reply",
          "id": "lj.more",
          "title": "רוצה לשמוע עוד"
        },
        {
          "kind": "reply",
          "id": "lj.not_now",
          "title": "תודה, לא כרגע"
        }
      ],
      "effects": []
    },
    {
      "id": "first_menu_opening",
      "trigger": {
        "kind": "first_message",
        "when": "menu_opening"
      },
      "text": "היי, כיף שפניתם ל־GT Everyday!\nהנה תפריט הפתיחה שאנחנו ממליצים עליו בחום: מגוון משקאות פשוטים ורווחיים, שהצוות שלכם ילמד להכין ביום אחד.\nאתם מוזמנים כבר לבצע הזמנה ראשונה, ואם אתם רוצים לשמוע עוד, נחזור אליכם בהקדם.\nאיך תרצו להמשיך?",
      "footer": "מדי פעם נשלח לכם עדכונים על המוצרים. לא מתאים? כתבו \"הסר\"",
      "buttons": [
        {
          "kind": "reply",
          "id": "lj.order",
          "title": "אני רוצה להזמין"
        },
        {
          "kind": "reply",
          "id": "lj.more",
          "title": "רוצה לשמוע עוד"
        },
        {
          "kind": "reply",
          "id": "lj.not_now",
          "title": "תודה, לא כרגע"
        }
      ],
      "effects": []
    },
    {
      "id": "general_reply",
      "trigger": {
        "kind": "first_message",
        "when": "no_menu"
      },
      "text": "היי, תודה שפניתם ל־GT Everyday.\nקיבלנו את ההודעה שלכם ונחזור אליכם בהקדם!\nבינתיים, כאן תמצאו תשובות לכל השאלות החשובות, ותכירו אותנו ואת צורת העבודה שלנו מקרוב.",
      "footer": "מדי פעם נשלח לכם עדכונים על המוצרים. לא מתאים? כתבו \"הסר\"",
      "buttons": [
        {
          "kind": "link",
          "title": "שאלות ותשובות"
        }
      ],
      "effects": []
    },
    {
      "id": "order_link",
      "trigger": {
        "kind": "button",
        "button_id": "lj.order"
      },
      "text": "מעולה! הנה הקישור האישי שלכם להזמנה.\nוכל שאלה, פשוט כתבו לנו כאן (:",
      "footer": null,
      "buttons": [
        {
          "kind": "link",
          "title": "להזמנה"
        }
      ],
      "effects": []
    },
    {
      "id": "customer_link",
      "trigger": {
        "kind": "button",
        "button_id": "lj.order",
        "known_customer": true
      },
      "text": "בשמחה! הנה הקישור שלכם להזמנה.",
      "footer": null,
      "buttons": [
        {
          "kind": "link",
          "title": "להזמנה"
        }
      ],
      "effects": []
    },
    {
      "id": "more_info",
      "trigger": {
        "kind": "button",
        "button_id": "lj.more"
      },
      "text": "בשמחה! נתקשר אליכם בהקדם לשיחה קצרה.\nבינתיים, כאן תמצאו תשובות לכל השאלות החשובות שלכם, ותכירו אותנו ואת צורת העבודה שלנו מקרוב.",
      "footer": null,
      "buttons": [
        {
          "kind": "link",
          "title": "שאלות ותשובות"
        }
      ],
      "effects": [
        "owner_alerted"
      ]
    },
    {
      "id": "not_now",
      "trigger": {
        "kind": "button",
        "button_id": "lj.not_now"
      },
      "text": "מבינים לגמרי, ותודה רבה שהתעניינתם ב־GT Everyday.\nאם בעתיד זה יתאים לכם, אנחנו כאן. פשוט כתבו לנו.",
      "footer": null,
      "buttons": [],
      "effects": [
        "lost_not_now",
        "opted_out"
      ]
    },
    {
      "id": "free_text_reply",
      "trigger": {
        "kind": "free_text"
      },
      "text": "בשמחה! נתקשר אליכם בהקדם לשיחה קצרה.\nבינתיים, כאן תמצאו תשובות לכל השאלות החשובות שלכם, ותכירו אותנו ואת צורת העבודה שלנו מקרוב.",
      "footer": null,
      "buttons": [
        {
          "kind": "link",
          "title": "שאלות ותשובות"
        }
      ],
      "effects": [
        "owner_alerted"
      ]
    },
    {
      "id": "optout_confirm",
      "trigger": {
        "kind": "stop_text"
      },
      "text": "הוסרת מהעדכונים, ולא נשלח לך עוד הודעות כאלה.\nאם בעתיד יתאים לך, אנחנו תמיד כאן.",
      "footer": null,
      "buttons": [],
      "effects": [
        "opted_out"
      ]
    },
    {
      "id": "wake_1",
      "trigger": {
        "kind": "wake",
        "step": 1,
        "slots": "any",
        "on": "after_conversation",
        "template": "gt_lead_wake_1"
      },
      "text": "היי {{name}}, היה כיף לדבר איתך!\nהנה שוב {{menu}} שדיברנו עליו, ולמטה הקישור להזמנה, מתי שנוח לך.\nאני כאן לכל שאלה (:\n{{rep}}, GT Everyday",
      "footer": "להסרה מהעדכונים אפשר להשיב \"הסר\"",
      "buttons": [
        {
          "kind": "link",
          "title": "להזמנה"
        }
      ],
      "effects": []
    },
    {
      "id": "wake_2",
      "trigger": {
        "kind": "wake",
        "step": 2,
        "slots": "morning",
        "on": "follow_up_date",
        "template": "gt_lead_wake_2"
      },
      "text": "בוקר טוב {{name}}!\nאתקשר אליך היום להמשך השיחה שלנו.\nעד אז, שווה להציץ כאן: כל מה שחשוב לדעת עלינו ועל צורת העבודה שלנו.\n{{rep}}, GT Everyday",
      "footer": "להסרה מהעדכונים אפשר להשיב \"הסר\"",
      "buttons": [
        {
          "kind": "link",
          "title": "שאלות ותשובות"
        }
      ],
      "effects": []
    },
    {
      "id": "wake_3",
      "trigger": {
        "kind": "wake",
        "step": 3,
        "slots": "morning",
        "on": "follow_up_date",
        "template": "gt_lead_wake_3"
      },
      "text": "היי {{name}}, בוקר טוב!\nלפני השיחה שלנו היום, רציתי לספר שאצלנו אף אחד לא נשאר לבד. לכל מוצר ולכל משקה יש סרטון הדרכה, ויש גם חוברת משקאות עם הוראות הכנה ותמחור מלא.\nהקישור להזמנה מחכה לך למטה.\n{{rep}}, GT Everyday",
      "footer": "להסרה מהעדכונים אפשר להשיב \"הסר\"",
      "buttons": [
        {
          "kind": "link",
          "title": "להזמנה"
        }
      ],
      "effects": []
    },
    {
      "id": "wake_4",
      "trigger": {
        "kind": "wake",
        "step": 4,
        "slots": "morning",
        "on": "follow_up_date",
        "template": "gt_lead_wake_4"
      },
      "text": "בוקר טוב {{name}},\nלא רוצה להעמיס עליך, אז אתקשר היום רק לשמוע איפה זה עומד מבחינתך.\nאם כבר בא לך להתחיל, הקישור להזמנה כאן למטה. ואם עכשיו זה לא הזמן, זה לגמרי בסדר.\n{{rep}}, GT Everyday",
      "footer": "להסרה מהעדכונים אפשר להשיב \"הסר\"",
      "buttons": [
        {
          "kind": "link",
          "title": "להזמנה"
        }
      ],
      "effects": []
    }
  ],
  "wake_rules": {
    "timezone": "Asia/Jerusalem",
    "days": "sun_thu",
    "slots": {
      "morning": {
        "from": "10:00",
        "to": "11:30"
      },
      "afternoon": {
        "from": "15:00",
        "to": "17:00"
      }
    },
    "first_after_hours": 2,
    "min_hours_between": 48,
    "quiet_after_staff_hours": 24,
    "retry_after_hours": 24,
    "max_messages": 4
  }
};
