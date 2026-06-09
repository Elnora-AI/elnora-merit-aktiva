---
name: merit-customers
description: Find or create a Merit Aktiva customer (or vendor)
argument-hint: "<name / reg no / details>"
allowed-tools: Bash, Read
---

# Merit Customers

Find or create a Merit Aktiva customer/vendor for: **{{args}}**

## Find

`customers list` MUST be filtered (an unfiltered query returns a server error):

```bash
elnora-merit customers list --name "<name>"
elnora-merit customers list --reg-no "<regno>"
elnora-merit vendors list --name "<name>"
```

## Create

Body-driven. Required: `Name` (unique), `CountryCode`, `NotTDCustomer` (lowercase `"true"`/`"false"`). Check the schema first:

```bash
elnora-merit customers create --help
elnora-merit customers create --data '{"Name":"Acme OÜ","CountryCode":"EE","NotTDCustomer":"false","RegNo":"12345678","Email":"billing@acme.ee"}'
```

For vendors use `elnora-merit vendors create`.

## Present

After a lookup, show the matching customer(s) with Id, name, reg no, and balance if present. After a create, confirm the returned `Id` and `Name`.

## Don't

- Don't create a duplicate — search by name/reg no first and confirm with the user if a close match exists.
- Don't guess `NotTDCustomer`: `true` for physical persons and foreign companies, `false` for domestic tax-registered companies. Ask if unclear.
