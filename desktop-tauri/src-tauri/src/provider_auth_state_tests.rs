use super::product_detail;

#[test]
fn plan_copy_is_product_scoped() {
    assert_eq!(product_detail("Claude", "max"), "Claude Max");
    assert_eq!(product_detail("Claude", ""), "Claude");
}
