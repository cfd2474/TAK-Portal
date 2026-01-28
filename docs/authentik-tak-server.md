# Authentik - TAK Server Connection Configuration


Details go here...

Will add more details later, but here is the core config that works for me:

You will want to do the following:
1. Correct the LDAP URL for your Authentik instance
2. Correct the userstring to match your ldap enviroment
3. Update the Service account DN to match the DN of your service account
4. Update the Service Account Credential to match your ldap service account password

```
    <auth default="ldap" x509groups="true" x509addAnonymous="false" x509useGroupCache="true" x509useGroupCacheDefaultActive="true" x509checkRevocation="true">
        <ldap url="ldap://YOUR.IP.HERE" userstring="cn={username},ou=users,dc=takldap" updateinterval="60" groupprefix="cn=tak_" groupNameExtractorRegex="cn=tak_(.*?)(?:,|$)" serviceAccountDN="cn=adm_ldapservice,ou=users,dc=takldap" serviceAccountCredential="YOURPASSWORDHERE" groupBaseRDN="ou=groups,dc=takldap" userBaseRDN="ou=users,dc=takldap" dnAttributeName="DN" nameAttr="CN"/>
        <File location="UserAuthenticationFile.xml"/>
    </auth>

```