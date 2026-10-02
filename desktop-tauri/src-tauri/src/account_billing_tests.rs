use super::{balance, topup};
use serde_json::json;

#[test]
fn wallet_projection_preserves_fractional_tokens_and_rejects_invalid_units() {
    let wallet = json!({"version":2,"unitScale":10000,"availableUnits":"123456","heldUnits":"7","paidAvailableUnits":"100001"});
    assert_eq!(balance(&wallet, "available").unwrap(), 12.3456);
    assert_eq!(balance(&wallet, "held").unwrap(), 0.0007);
    assert_eq!(balance(&wallet, "paidAvailable").unwrap(), 10.0001);
    for units in ["-1", "1.5", "1e4", "", "9007199254740992"] {
        assert!(balance(
            &json!({"version":2,"unitScale":10000,"availableUnits":units}),
            "available"
        )
        .is_err());
    }
    assert!(balance(
        &json!({"version":2,"unitScale":1000,"availableUnits":"123"}),
        "available"
    )
    .is_err());
    assert!(balance(
        &json!({"version":2,"unitScale":10000,"availableUnits":123}),
        "available"
    )
    .is_err());
    assert_eq!(
        balance(&json!({"version":1,"available":123}), "available").unwrap(),
        123.0
    );
}

#[test]
fn only_sellable_stripe_topups_are_displayed_with_catalogue_prices() {
    let mut offer = json!({"kind":"topup","offerKey":"tokens_1000","stripeEnabled":true,"credits":1000,"pence":499});
    let parsed = topup(&offer).unwrap();
    assert_eq!(parsed.key, "tokens_1000");
    assert_eq!(parsed.credits, 1000);
    assert_eq!(parsed.price_pence, 499);
    offer["stripeEnabled"] = json!(false);
    assert!(topup(&offer).is_none());
    offer["stripeEnabled"] = json!(true);
    offer["kind"] = json!("membership");
    assert!(topup(&offer).is_none());
}
